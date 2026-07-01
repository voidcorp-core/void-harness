// `void-harness graph` — build the model, gate on it (check), or report (audit).
// Thin shell over @voidcorp/harness-graph (functional core / imperative shell),
// mirroring the existing `audit` command.
//
// Path note: output paths (model.json, relations.graph.yaml, packs/) are anchored
// on PKGS_ROOT (2 levels up from dist/main.js), not on dirname(coreSource).
// findCoreSource() may return packages/cli/core-assets (the bundled npm copy),
// whose parent is not the workspace packages root. Using import.meta.url is more
// reliable for deriving sibling-package locations at runtime.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyze,
  analyzeBehavior,
  analyzeCost,
  assembleModel,
  blockingFindings,
  DEFAULT_PRICING,
  mergePricing,
  parseActivations,
  scanSourceTree,
  serializeModel,
} from '@voidcorp/harness-graph';
import type { CostRow, GraphModel } from '@voidcorp/harness-graph';
import { BUNDLED_MODEL_JSON, resolveBundledModel } from '../lib/bundled-model.js';
import { readSessionCosts } from '../lib/transcript-cost.js';
import { parseUsageLog } from '../lib/audit.js';
import { startLiveServer } from '../lib/graph-live-server.js';
import { findCoreSource } from '../lib/paths.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import { usedSkillNames } from '../lib/graph-io.js';

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
  return join(PKGS_ROOT, 'harness-graph', 'model.json');
}
function relationsPath(_coreSource: string): string {
  return join(PKGS_ROOT, 'harness-graph', 'relations.graph.yaml');
}

/** Compact token count: 12345 -> `12k`, below 1000 shown as-is. */
function fmtK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
}

/** One flagged cost row. Real columns ($/sess, cache%) render only in full mode. */
function renderCostRow(r: CostRow, nameW: number, full: boolean): string {
  const flags = r.flags.map((f) => (f === 'dead' || f === 'dead-hook' ? c.red(f) : c.yellow(f))).join(' ');
  const base = `${r.nodeId.padEnd(nameW)}  ${String(r.invocations).padStart(4)}  ${String(r.staticTokens).padStart(7)}`;
  if (!full) return `${base}  ${flags}`;
  const real = r.realSignal;
  const total = real ? fmtK(real.tokens.in + real.tokens.out + real.tokens.cacheRead + real.tokens.cacheCreation) : '-';
  const dollars = real?.dollars !== undefined ? `${real.dollars.toFixed(2)}$` : '-';
  const cache = r.cacheReadRatio !== undefined ? `${Math.round(r.cacheReadRatio * 100)}%` : '-';
  return `${base}  ${total.padStart(8)}  ${dollars.padStart(7)}  ${cache.padStart(5)}  ${flags}`;
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

async function loadModel(coreSource: string) {
  const tree = scanSourceTree(coreSource, packsDirFor(coreSource));
  const rp = relationsPath(coreSource);
  const declared = existsSync(rp) ? readFileSync(rp, 'utf8') : '';
  return assembleModel(tree, declared);
}

/**
 * Resolve the model for a reporting subcommand. In the monorepo we scan the source tree; when
 * the CLI is bundled for a consumer, the baked model travels inside the bundle and is filtered
 * to the consumer's enabled packs — no source scan, no monorepo paths.
 */
async function resolveModel(coreSource: string, bundledJson: string | undefined): Promise<GraphModel> {
  if (bundledJson !== undefined) return resolveBundledModel(bundledJson, process.cwd());
  return loadModel(coreSource);
}

function ctxFor(): { usedSkillNames: Set<string> } {
  const logPath = join(process.cwd(), '.void', 'usage.log');
  const usage = existsSync(logPath) ? parseUsageLog(readFileSync(logPath, 'utf8')) : [];
  return { usedSkillNames: usedSkillNames(usage) };
}

export async function graph(
  args: readonly string[],
  opts: { readonly bundledModelJson?: string } = {},
): Promise<void> {
  const sub = args[0] ?? 'build';
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

  if (sub === 'build') {
    const model = await loadModel(coreSource);
    writeFileSync(modelPath(coreSource), serializeModel(model));
    banner('graph build');
    blank();
    line(`  ${c.green(`${model.nodes.length} nodes`)} ${c.dim(glyph.dot)} ${c.green(`${model.edges.length} edges`)} -> ${c.dim('harness-graph/model.json')}`);
    footer(c.dim('model.json regenerated. Commit it; the check gate fails on drift.'));
    return;
  }

  if (sub === 'check') {
    const model = await loadModel(coreSource);
    const onDisk = existsSync(modelPath(coreSource)) ? readFileSync(modelPath(coreSource), 'utf8') : '';
    const drift = onDisk !== serializeModel(model);
    const blocking = blockingFindings(analyze(model, ctxFor()));
    banner('graph check');
    blank();
    if (drift) {
      line(`  ${c.red('model.json is stale')} -- run \`void-harness graph build\` and commit.`);
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
    const logPath = strFlag(args, '--log', join(process.cwd(), '.void', 'activations.jsonl'));
    const sinceDays = numFlag(args, '--since', 0);
    const events = parseActivations(existsSync(logPath) ? readFileSync(logPath, 'utf8') : '');
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
      footer(c.dim('let the activation-meter hook accumulate more sessions, then retry.'));
      return;
    }
    line(
      `  ${c.dim('events')} ${report.stats.events} ${c.dim(glyph.dot)} ${c.dim('sessions')} ${report.stats.sessions} ${c.dim(glyph.dot)} ${c.dim('findings')} ${report.findings.length}`,
    );
    for (const f of report.findings) {
      blank();
      const tag = f.count !== undefined ? c.dim(` (x${f.count})`) : '';
      line(`  ${c.dim('info')} ${c.bold(f.kind)} ${c.dim(f.nodes.join(', '))}${tag}`);
      line(`    ${f.evidence}`);
      line(`    ${c.dim(`-> ${f.suggestion}`)}`);
    }
    blank();
    footer(c.dim('advisory (HITL): dead nodes may be context-specific; should-have-fired may need trigger tuning.'));
    return;
  }

  if (sub === 'cost') {
    const model = await resolveModel(coreSource, bundled);
    const logPath = strFlag(args, '--log', join(process.cwd(), '.void', 'activations.jsonl'));
    const sinceDays = numFlag(args, '--since', 0);
    const events = parseActivations(existsSync(logPath) ? readFileSync(logPath, 'utf8') : '');
    const { costs, skipped } = readSessionCosts(process.cwd());
    const pricing = loadPricing(args);
    const report = analyzeCost(model, events, {
      sessionCosts: costs,
      pricing,
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
        ? `  ${'component'.padEnd(nameW)}  ${'inv'.padStart(4)}  ${'static'.padStart(7)}  ${'real'.padStart(8)}  ${'$/sess'.padStart(7)}  ${'cache'.padStart(5)}  flags`
        : `  ${'component'.padEnd(nameW)}  ${'inv'.padStart(4)}  ${'static'.padStart(7)}  flags`;
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
    const logPath = strFlag(args, '--log', join(process.cwd(), '.void', 'activations.jsonl'));
    const historyMax = numFlag(args, '--history-max', 5000);
    const modelJson = serializeModel(await resolveModel(coreSource, bundled));
    banner('graph live');
    blank();
    line(`  serving model + SSE on ${c.green(`http://localhost:${port}`)}`);
    line(`  ${c.dim('tailing')} ${logPath}`);
    line(`  ${c.dim('routes')} GET /model.json ${c.dim(glyph.dot)} GET /history ${c.dim(glyph.dot)} GET /events ${c.dim('(SSE)')}`);
    line(`  ${c.dim('point the studio at it via')} VITE_LIVE_URL`);
    footer(c.dim('Ctrl+C to stop.'));
    startLiveServer({ port, logPath, modelJson, historyMax });
    return; // the listening socket keeps the process alive
  }

  console.error(`unknown graph subcommand: ${sub}\n`); // allow-console: error-exit branch per brief
  process.exit(2);
}
