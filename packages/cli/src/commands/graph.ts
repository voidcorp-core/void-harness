// `void-harness graph` — build the model, gate on it (check), or report (audit).
// Thin shell over @voidcorp/harness-graph (functional core / imperative shell),
// mirroring the existing `audit` command.
//
// Path note: source paths (relations.graph.yaml, packs/) are anchored on
// PKGS_ROOT (2 levels up from dist/main.js), not on dirname(coreSource).
// findCoreSource() may return packages/cli/core-assets (the bundled npm copy),
// whose parent is not the workspace packages root. Using import.meta.url is more
// reliable for deriving sibling-package locations at runtime.
//
// Consumer note: an npm install has no `packs/` source tree, so the reporting
// subcommands (audit/cost/behavior/live) reuse the frozen, complete `model.json`
// shipped in `core-assets/data/` instead of a packs-less source scan. See
// resolveModel below. build/check remain monorepo-only.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { voidReadPath } from '@voidcorp/hook-runner';
import { fileURLToPath } from 'node:url';
import {
  analyze,
  analyzeBehavior,
  analyzeCost,
  adaptCatalogV1,
  assembleModel,
  blockingFindings,
  DEFAULT_PRICING,
  mergePricing,
  parseActivations,
  parseOutcomes,
  projectCatalogV3ToV1,
  scanSourceTree,
  serializeGraphSnapshot,
  serializeModel,
} from '@voidcorp/harness-graph';
import type { CostRow, GraphModel, GraphSnapshotV3 } from '@voidcorp/harness-graph';
import { BUNDLED_MODEL_JSON, resolveBundledModel } from '../lib/bundled-model.js';
import { BUNDLED_STUDIO_HTML } from '../lib/bundled-studio.js';
import { readSessionCosts } from '../lib/transcript-cost.js';
import { startLiveServer } from '../lib/graph-live-server.js';
import { findCoreSource } from '../lib/paths.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import {
  loadSkillUsage,
  loadTelemetryStream,
  usedSkillNames,
} from '../lib/graph-io.js';
import {
  openProjectGraphStore,
  ProjectGraphStoreError,
  PROJECT_QUERY_NAMES,
  projectQueryArity,
  runProjectQuery,
  type ProjectGraphStore,
  type ProjectQueryName,
  type ProjectQueryProblem,
} from '../lib/project-graph-store.js';
import { DEFAULT_PROJECT_QUERY_BUDGET } from '@voidcorp/harness-graph/project';
import { discoverConfiguredProjects } from '../lib/projects/catalog.js';
import {
  mergeCanonicalTelemetry,
  mergeTelemetry,
} from '../lib/rollup.js';

/**
 * Load a telemetry stream body: the cross-project merge when `--all-projects` is
 * set (issue #72), else the single-project file (respecting a `--log` override).
 */
function loadTelemetryBody(args: readonly string[], file: string, logPath?: string): string {
  if (args.includes('--all-projects')) {
    const roots = discoverConfiguredProjects().projects.map((project) => project.path);
    return [mergeCanonicalTelemetry(roots), mergeTelemetry(roots, file)]
      .filter((body) => body !== '')
      .join('\n');
  }
  if (logPath !== undefined && args.includes('--log')) {
    return existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  }
  return loadTelemetryStream(process.cwd(), file);
}

/** Read `--flag value` from argv, falling back to `fallback`. */
function strFlag(args: readonly string[], flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
}
function numFlag(args: readonly string[], flag: string, fallback: number): number {
  const raw = strFlag(args, flag, '');
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

// packages/ root: dist/main.js -> dist -> cli -> packages
const PKGS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function packsDirFor(_coreSource: string): string {
  return join(PKGS_ROOT, 'packs');
}
function modelPath(_coreSource: string): string {
  return join(PKGS_ROOT, 'core', 'data', 'model.json');
}
function catalogPath(_coreSource: string): string {
  return join(PKGS_ROOT, 'core', 'data', 'catalog.v3.json');
}
function relationsPath(_coreSource: string): string {
  return join(PKGS_ROOT, 'harness-graph', 'relations.graph.yaml');
}

/** Compact token count: 12345 -> `12k`, below 1000 shown as-is. */
function fmtK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
}

/** Value column (issue #71): yield% when ok/error is known, `N?` when only
 * unknown-status completions exist, `-` when no outcome was recorded. */
function renderYield(r: CostRow): string {
  if (!r.outcome) return '-';
  if (r.outcome.yield !== undefined) return `${Math.round(r.outcome.yield * 100)}%`;
  return `${r.outcome.completions}?`;
}

/** One flagged cost row. Real columns ($/sess, cache%) render only in full mode. */
function renderCostRow(r: CostRow, nameW: number, full: boolean): string {
  const flags = r.flags
    .map((f) => (f === 'dead' || f === 'dead-hook' ? c.red(f) : f === 'always' ? c.green(f) : c.yellow(f)))
    .join(' ');
  const y = renderYield(r);
  const base = `${r.nodeId.padEnd(nameW)}  ${String(r.invocations).padStart(4)}  ${String(r.staticTokens).padStart(7)}`;
  if (!full) return `${base}  ${y.padStart(6)}  ${flags}`;
  const real = r.realSignal;
  const total = real ? fmtK(real.tokens.in + real.tokens.out + real.tokens.cacheRead + real.tokens.cacheCreation) : '-';
  const dollars = real?.dollars !== undefined ? `${real.dollars.toFixed(2)}$` : '-';
  const cache = r.cacheReadRatio !== undefined ? `${Math.round(r.cacheReadRatio * 100)}%` : '-';
  return `${base}  ${total.padStart(8)}  ${dollars.padStart(7)}  ${cache.padStart(5)}  ${y.padStart(6)}  ${flags}`;
}

/** Defaults merged with an optional .void/pricing.json (malformed -> defaults + warn). */
function loadPricing(args: readonly string[]) {
  const path = strFlag(args, '--pricing', join(process.cwd(), '.void', 'pricing.json'));
  if (!existsSync(path)) return DEFAULT_PRICING;
  try {
    return mergePricing(DEFAULT_PRICING, JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    console.error(`graph cost: ignoring malformed pricing file ${path}`); // allow-console: stderr warn per brief
    return DEFAULT_PRICING;
  }
}

async function loadCatalogGraph(coreSource: string): Promise<GraphSnapshotV3> {
  const tree = scanSourceTree(coreSource, packsDirFor(coreSource));
  const rp = relationsPath(coreSource);
  const declared = existsSync(rp) ? readFileSync(rp, 'utf8') : '';
  return adaptCatalogV1(assembleModel(tree, declared));
}

async function loadModel(coreSource: string): Promise<GraphModel> {
  return projectCatalogV3ToV1(await loadCatalogGraph(coreSource));
}

/**
 * Resolve the model for a reporting subcommand, in priority order:
 *   1. an esbuild-baked model (the plugin bundle path), filtered to enabled packs;
 *   2. the live source tree, when the monorepo `packs/` dir is present (maintainer — a fresh scan);
 *   3. the frozen, COMPLETE model.json shipped in `core-assets/data/` (npm consumer — reuse the
 *      built artifact so `graph audit/cost/behavior/live` work standalone, not a packs-less scan);
 *   4. a best-effort source scan (core-only) as a last resort.
 * `paths` is injected for testability (PKGS_ROOT is otherwise a module constant).
 */
export async function resolveModel(
  coreSource: string,
  bundledJson: string | undefined,
  paths: { packsDir: string; shippedModel: string } = {
    packsDir: packsDirFor(coreSource),
    shippedModel: join(coreSource, 'data', 'model.json'),
  },
): Promise<GraphModel> {
  if (bundledJson !== undefined) return resolveBundledModel(bundledJson, process.cwd());
  if (existsSync(paths.packsDir)) return loadModel(coreSource);
  if (existsSync(paths.shippedModel)) {
    return resolveBundledModel(readFileSync(paths.shippedModel, 'utf8'), process.cwd());
  }
  return loadModel(coreSource);
}

function ctxFor(): { usedSkillNames: Set<string> } {
  // Canonical skill usage plus legacy transition history.
  return { usedSkillNames: usedSkillNames(loadSkillUsage(process.cwd())) };
}

/** `--max-nodes`/`--max-depth` for a project query, or the usage problem to print. */
function projectQueryBudget(
  args: readonly string[],
): { maxNodes: number; maxDepth: number } | ProjectQueryProblem {
  const budget = { ...DEFAULT_PROJECT_QUERY_BUDGET };
  for (const [flag, key] of [
    ['--max-nodes', 'maxNodes'],
    ['--max-depth', 'maxDepth'],
  ] as const) {
    const index = args.indexOf(flag);
    if (index < 0) continue;
    const raw = args[index + 1] ?? '';
    // Whole digits only: `parseInt` reads `1e9` as 1 and `12abc` as 12, so a
    // permissive parse would answer a different question than the one asked and
    // report it as the one asked. A budget that lies is worse than no budget.
    const value = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isNaN(value)) {
      return {
        problem: `${flag} needs a non-negative whole number, got ${raw === '' ? '<nothing>' : raw}`,
        fix: `${flag} 200`,
      };
    }
    budget[key] = value;
  }
  return budget;
}

/** Positional targets, refusing any option this surface does not define. */
function projectQueryTargets(args: readonly string[]): readonly string[] | ProjectQueryProblem {
  const targets: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? '';
    if (token === '--max-nodes' || token === '--max-depth') {
      index += 1;
      continue;
    }
    if (token.startsWith('--')) {
      return {
        problem: `unknown option ${token} for a project graph query`,
        fix: 'the only options here are --max-nodes and --max-depth',
      };
    }
    targets.push(token);
  }
  return targets;
}

function renderProblem(name: string, problem: ProjectQueryProblem, code: number): never {
  line(`  ${c.red(problem.problem)}`);
  line(`  ${c.dim(`-> ${problem.fix}`)}`);
  footer(c.red(`graph ${name} failed.`));
  process.exit(code);
}

/**
 * One of the seven ProjectGraph queries, answered from a bounded read-only store.
 *
 * The rendering rule is the surface's whole contract: an incomplete answer is
 * never printed as a complete one. `fallback` and `truncated` are printed before
 * and after the answer respectively, and an unknown is printed as an unknown.
 */
async function projectQuery(
  name: ProjectQueryName,
  rest: readonly string[],
  open: (root: string) => Promise<ProjectGraphStore>,
): Promise<void> {
  banner(`graph ${name}`);
  blank();
  const budget = projectQueryBudget(rest);
  if ('problem' in budget) renderProblem(name, budget, 2);
  const targets = projectQueryTargets(rest);
  if ('problem' in targets) renderProblem(name, targets, 2);
  // Before the store: opening it builds the graph, and a missing argument must
  // not cost the caller a full extraction to be told about.
  const arity = projectQueryArity(name, targets.length);
  if (arity !== undefined) renderProblem(name, arity, 2);

  let store: ProjectGraphStore;
  try {
    store = await open(process.cwd());
  } catch (error) {
    const problem =
      error instanceof ProjectGraphStoreError
        ? error
        : {
            problem: `could not open the project graph in ${process.cwd()}`,
            fix: `run from a project root; underlying cause: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
    renderProblem(name, problem, 1);
  }

  const report = runProjectQuery(store, { name, targets, budget });
  if (report.error !== undefined) renderProblem(name, report.error, 2);
  if (report.fallback !== undefined) {
    line(`  ${c.yellow('fallback')} ${report.fallback}`);
    blank();
  }
  if (report.uncertain !== undefined) {
    line(`  ${c.yellow('uncertain')} ${report.uncertain}`);
    blank();
  }
  if (report.unknown !== undefined) line(`  ${c.dim(report.unknown)}`);
  for (const answer of report.answers) line(`  ${answer}`);
  if (report.truncated) {
    blank();
    line(
      `  ${c.yellow('truncated')} ${c.dim('the budget stopped this walk; raise --max-nodes/--max-depth or narrow the question')}`,
    );
  }
  blank();
  footer(
    c.dim(
      report.fallback === undefined
        ? 'bounded, read-only, and derived from the extracted tree.'
        : 'this answer may omit what extraction never saw -- confirm against source.',
    ),
  );
}

export async function graph(
  args: readonly string[],
  opts: {
    readonly bundledModelJson?: string;
    /** Injected in tests; production opens the store from the working directory. */
    readonly openProjectGraph?: (root: string) => Promise<ProjectGraphStore>;
  } = {},
): Promise<void> {
  const sub = args[0] ?? 'build';

  // Project queries are answered from the project's own graph, so they need
  // neither the harness source tree nor the bundled model, and are dispatched
  // before either is resolved.
  if ((PROJECT_QUERY_NAMES as readonly string[]).includes(sub)) {
    await projectQuery(
      sub as ProjectQueryName,
      args.slice(1),
      opts.openProjectGraph ?? ((root: string) => openProjectGraphStore(root)),
    );
    return;
  }
  // Bundled model: injected by the bundle build (BUNDLED_MODEL_JSON) or by a test via opts.
  // When present, reporting subcommands read it instead of scanning the source tree.
  const bundled = opts.bundledModelJson ?? BUNDLED_MODEL_JSON;
  // build/check regenerate/compare the committed model.json from source — monorepo-only.
  if (bundled !== undefined && (sub === 'build' || sub === 'check')) {
    throw new Error(`graph ${sub} is a monorepo-only command; not available in the installed bundle.`);
  }
  // Prefer the real source in the workspace; fall back to the bundled core-assets. In bundled
  // mode there is no source tree, so we never resolve it (findCoreSource would throw).
  const pkgsCoreDir = join(PKGS_ROOT, 'core');
  const coreSource =
    bundled !== undefined ? '' : existsSync(pkgsCoreDir) ? pkgsCoreDir : await findCoreSource();

  if (sub === 'model-hash') {
    // Self-report the sha256 of the model this process would use as its source of truth:
    // the baked model when bundled, the committed model.json in the monorepo. The consumer
    // artifact and the repo agree iff these hashes match (see `check-bundle`).
    const source =
      bundled !== undefined
        ? bundled
        : existsSync(modelPath(coreSource))
          ? readFileSync(modelPath(coreSource), 'utf8')
          : serializeModel(await loadModel(coreSource));
    process.stdout.write(`${createHash('sha256').update(source).digest('hex')}\n`);
    return;
  }

  if (sub === 'check-bundle') {
    // Drift gate for the shipped artifact: does packages/core/graph/void-graph.mjs embed the
    // current model.json? We gate the embedded model (the part that drifts with harness content),
    // not the whole vite/esbuild output (byte-determinism across environments is not guaranteed).
    const artifact = join(PKGS_ROOT, 'core', 'graph', 'void-graph.mjs');
    banner('graph check-bundle');
    blank();
    if (!existsSync(artifact)) {
      line(`  ${c.red('artifact missing')} -- run \`pnpm -F voidharness build:void-graph\``);
      footer(c.red('graph check-bundle failed.'));
      process.exit(1);
    }
    const committed = createHash('sha256').update(readFileSync(modelPath(coreSource), 'utf8')).digest('hex');
    const embedded = execFileSync('node', [artifact, 'model-hash'], { encoding: 'utf8' }).trim();
    if (committed !== embedded) {
      line(`  ${c.red('stale bundle')} -- committed model ${c.dim(committed.slice(0, 12))} != artifact embeds ${c.dim(embedded.slice(0, 12))}`);
      line(`  ${c.dim('rebuild')} pnpm -F voidharness build:void-graph ${c.dim('and commit the artifact')}`);
      footer(c.red('graph check-bundle failed.'));
      process.exit(1);
    }
    footer(c.green('artifact embeds the committed model.'));
    return;
  }

  if (sub === 'build') {
    const catalog = await loadCatalogGraph(coreSource);
    const model = projectCatalogV3ToV1(catalog);
    writeFileSync(catalogPath(coreSource), serializeGraphSnapshot(catalog));
    writeFileSync(modelPath(coreSource), serializeModel(model));
    banner('graph build');
    blank();
    line(`  ${c.green(`${model.nodes.length} nodes`)} ${c.dim(glyph.dot)} ${c.green(`${model.edges.length} edges`)} -> ${c.dim('core/data/catalog.v3.json')}`);
    footer(c.dim('CatalogGraph v3 and its read-only model.json compatibility projection regenerated.'));
    return;
  }

  if (sub === 'check') {
    const catalog = await loadCatalogGraph(coreSource);
    const model = projectCatalogV3ToV1(catalog);
    const onDisk = existsSync(modelPath(coreSource)) ? readFileSync(modelPath(coreSource), 'utf8') : '';
    const catalogOnDisk = existsSync(catalogPath(coreSource))
      ? readFileSync(catalogPath(coreSource), 'utf8')
      : '';
    const legacyDrift = onDisk !== serializeModel(model);
    const catalogDrift = catalogOnDisk !== serializeGraphSnapshot(catalog);
    const drift = legacyDrift || catalogDrift;
    const blocking = blockingFindings(analyze(model, ctxFor()));
    banner('graph check');
    blank();
    if (drift) {
      line(`  ${c.red('graph snapshot is stale')} -- run \`void-harness graph build\` and commit.`);
      if (catalogDrift) line(`    ${c.dim('catalog.v3.json differs from the validated source graph')}`);
      if (!legacyDrift) {
        line(`    ${c.dim('model.json compatibility projection is current')}`);
      }
      const fresh = serializeModel(model).split('\n');
      const old = onDisk.split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(fresh.length, old.length) && shown < 6; i += 1) {
        if (fresh[i] !== old[i]) {
          line(`    L${i + 1} committed: ${c.dim((old[i] ?? '<missing>').trim())}`);
          line(`    L${i + 1} rebuilt:   ${c.dim((fresh[i] ?? '<missing>').trim())}`);
          shown += 1;
        }
      }
    }
    for (const f of blocking) line(`  ${c.red('error')} ${f.kind}: ${f.evidence}`);
    if (drift || blocking.length > 0) {
      footer(c.red('graph check failed.'));
      process.exit(1);
    }
    footer(c.green('graph check passed.'));
    return;
  }

  if (sub === 'audit') {
    const model = await resolveModel(coreSource, bundled);
    const findings = analyze(model, ctxFor());
    banner('graph audit');
    blank();
    line(`  ${c.dim('nodes')} ${model.nodes.length} ${c.dim(glyph.dot)} ${c.dim('edges')} ${model.edges.length} ${c.dim(glyph.dot)} ${c.dim('findings')} ${findings.length}`);
    for (const f of findings) {
      const sev = f.severity === 'error' ? c.red(f.severity) : f.severity === 'warning' ? c.yellow(f.severity) : c.dim(f.severity);
      blank();
      line(`  ${sev} ${c.bold(f.kind)} ${c.dim(f.nodes.join(', '))}`);
      line(`    ${f.evidence}`);
      line(`    ${c.dim(`-> ${f.suggestion}`)}`);
    }
    blank();
    footer(c.dim('warnings/info are signals to weigh (HITL); only broken-route blocks CI.'));
    return;
  }

  if (sub === 'behavior') {
    const model = await resolveModel(coreSource, bundled);
    const logPath = strFlag(args, '--log', voidReadPath(process.cwd(), 'activations.jsonl'));
    const sinceDays = numFlag(args, '--since', 0);
    const events = parseActivations(loadTelemetryBody(args, 'activations.jsonl', logPath));
    const report = analyzeBehavior(
      model,
      events,
      sinceDays > 0 ? { sinceMs: Date.now() - sinceDays * 86_400_000 } : {},
    );
    banner('graph behavior');
    blank();
    if (!report.sufficient) {
      line(
        `  ${c.yellow('insufficient data')} ${c.dim(glyph.dot)} ${report.stats.events} events, ${report.stats.sessions} sessions ${c.dim('(need >=20 events / >=3 sessions)')}`,
      );
      if (report.stats.excludedSessions > 0) {
        line(
          `  ${c.dim('synthetic excluded')} ${report.stats.excludedEvents} events ${c.dim(glyph.dot)} ${report.stats.excludedSessions} sessions`,
        );
      }
      footer(c.dim('let the activation-meter hook accumulate more sessions, then retry.'));
      return;
    }
    line(
      `  ${c.dim('events')} ${report.stats.events} ${c.dim(glyph.dot)} ${c.dim('sessions')} ${report.stats.sessions} ${c.dim(glyph.dot)} ${c.dim('findings')} ${report.findings.length}`,
    );
    if (report.stats.excludedSessions > 0) {
      line(
        `  ${c.dim('synthetic excluded')} ${report.stats.excludedEvents} events ${c.dim(glyph.dot)} ${report.stats.excludedSessions} sessions`,
      );
    }
    for (const f of report.findings) {
      blank();
      const tag = f.count !== undefined ? c.dim(` (x${f.count})`) : '';
      line(`  ${c.dim('info')} ${c.bold(f.kind)} ${c.dim(f.nodes.join(', '))}${tag}`);
      line(`    ${f.evidence}`);
      line(`    ${c.dim(`-> ${f.suggestion}`)}`);
    }
    blank();
    footer(c.dim('advisory (HITL): dead nodes may be context-specific; should-have-fired may need trigger tuning; telemetry-gap means the meter likely does not record that tool.'));
    return;
  }

  if (sub === 'cost') {
    const model = await resolveModel(coreSource, bundled);
    const logPath = strFlag(args, '--log', voidReadPath(process.cwd(), 'activations.jsonl'));
    const sinceDays = numFlag(args, '--since', 0);
    const events = parseActivations(loadTelemetryBody(args, 'activations.jsonl', logPath));
    const outcomes = parseOutcomes(loadTelemetryBody(args, 'outcomes.jsonl'));
    const { costs, skipped } = readSessionCosts(process.cwd());
    const pricing = loadPricing(args);
    const report = analyzeCost(model, events, {
      sessionCosts: costs,
      pricing,
      outcomes,
      minSessions: numFlag(args, '--min-sessions', 3),
      minEvents: numFlag(args, '--min-events', 20),
      ...(sinceDays > 0 ? { sinceMs: Date.now() - sinceDays * 86_400_000 } : {}),
    });
    const full = report.mode === 'full';
    banner('graph cost');
    blank();
    if (!report.sufficient) {
      line(
        `  ${c.yellow('insufficient data')} ${c.dim(glyph.dot)} ${report.stats.events} events, ${report.stats.sessions} sessions ${c.dim('(need >=20 events / >=3 sessions)')}`,
      );
      footer(c.dim('let the activation-meter hook accumulate more sessions, then retry.'));
      return;
    }
    const flagged = report.rows.filter((r) => r.flags.length > 0);
    const skippedNote = full && skipped > 0 ? ` ${c.dim(glyph.dot)} ${c.dim(`${skipped} transcript line(s) skipped`)}` : '';
    line(
      `  ${c.dim('components')} ${report.rows.length} ${c.dim(glyph.dot)} ${c.dim('events')} ${report.stats.events} ${c.dim(glyph.dot)} ${c.dim('sessions')} ${report.stats.sessions} ${c.dim(glyph.dot)} ${c.dim('mode')} ${report.mode}${skippedNote}`,
    );
    blank();
    if (flagged.length === 0) {
      line(`  ${c.green('no flags')} ${c.dim('- every component earns its place in this window.')}`);
    } else {
      const nameW = Math.max(...flagged.map((r) => r.nodeId.length));
      const head = full
        ? `  ${'component'.padEnd(nameW)}  ${'inv'.padStart(4)}  ${'static'.padStart(7)}  ${'real'.padStart(8)}  ${'$/sess'.padStart(7)}  ${'cache'.padStart(5)}  ${'yield'.padStart(6)}  flags`
        : `  ${'component'.padEnd(nameW)}  ${'inv'.padStart(4)}  ${'static'.padStart(7)}  ${'yield'.padStart(6)}  flags`;
      line(head);
      for (const r of flagged) line(`  ${renderCostRow(r, nameW, full)}`);
    }
    blank();
    line(
      `  ${c.dim(`${report.rows.length - flagged.length} unflagged component(s) omitted`)} ${c.dim(glyph.dot)} ${c.dim(full ? 'real signal = median session cost where the component fired (correlational)' : 'static cost = source tokens x invocations')}`,
    );
    footer(c.dim('advisory (HITL): flags are candidates to trim/tune, never auto-applied.'));
    return;
  }

  if (sub === 'live') {
    const port = numFlag(args, '--port', 4317);
    const logPath = strFlag(args, '--log', voidReadPath(process.cwd(), 'activations.jsonl'));
    const historyMax = numFlag(args, '--history-max', 5000);
    const model = await resolveModel(coreSource, bundled);
    const modelJson = serializeModel(model);
    const catalogJson = serializeGraphSnapshot(adaptCatalogV1(model));
    const ctx = ctxFor();
    // Server-fed studio data: computed once here (kernel analyze + cost), served at
    // /studio-data.json. workflows stay {} on the consumer (phase metadata is build-time only).
    // Cost is REAL here (transcripts via readSessionCosts) — the consumer's own $/tokens; 1/1
    // volume floor keeps the cost layer populated (viz is advisory, not the CLI's gated report).
    const events = parseActivations(loadTelemetryBody(args, 'activations.jsonl', logPath));
    const cost = analyzeCost(model, events, {
      sessionCosts: readSessionCosts(process.cwd()).costs,
      pricing: loadPricing(args),
      outcomes: parseOutcomes(loadTelemetryBody(args, 'outcomes.jsonl')),
      minSessions: 1,
      minEvents: 1,
    });
    const studioDataJson = JSON.stringify({
      model,
      findings: analyze(model, ctx),
      usage: { counts: {}, usedSkillNames: [...ctx.usedSkillNames] },
      workflows: {},
      cost,
    });
    const studioHtml = BUNDLED_STUDIO_HTML;
    const launchToken = randomBytes(32).toString('base64url');
    banner('graph live');
    blank();
    line(
      `  ${c.dim('tailing')} ${
        args.includes('--log') ? logPath : '.void/runs/*/events.jsonl'
      }`,
    );
    startLiveServer({
      port,
      logPath,
      modelJson,
      catalogJson,
      launchToken,
      historyMax,
      studioHtml,
      studioDataJson,
      readEventBody: () =>
        loadTelemetryBody(args, 'activations.jsonl', logPath),
      // Print the actually-bound port (may differ from --port after the busy-port fallback).
      onListening: (actualPort) => {
        const launchUrl =
          `http://localhost:${actualPort}/auth?token=${encodeURIComponent(launchToken)}`;
        line(`  serving on ${c.green(launchUrl)}`);
        if (studioHtml !== undefined) {
          line(`  ${c.dim('routes')} GET / ${c.dim('(studio)')} ${c.dim(glyph.dot)} /catalog.v3.json ${c.dim(glyph.dot)} /model.json ${c.dim(glyph.dot)} /studio-data.json ${c.dim(glyph.dot)} /history ${c.dim(glyph.dot)} /events`);
          line(`  ${c.dim('open the URL above in a browser')}`);
        } else {
          line(`  ${c.dim('routes')} GET /catalog.v3.json ${c.dim(glyph.dot)} GET /model.json ${c.dim(glyph.dot)} GET /history ${c.dim(glyph.dot)} GET /events ${c.dim('(SSE)')}`);
          line(`  ${c.dim('point the studio at it via')} VITE_LIVE_URL`);
        }
        footer(c.dim('Ctrl+C to stop.'));
      },
    });
    return; // the listening socket keeps the process alive
  }

  console.error(`unknown graph subcommand: ${sub}\n`); // allow-console: error-exit branch per brief
  process.exit(2);
}
