// `void-harness status` — the deterministic, offline, LLM-free project health surface.
// Gathers local signals, joins them with the frozen certification into a ProjectState + score,
// renders the terminal view, and persists .void/local/state.json (+ a history snapshot).

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { voidLocalDir } from '@voidcorp/hook-runner';
import { fileURLToPath } from 'node:url';
import {
  adaptCatalogV1,
  type Certification,
  computeProjectState,
  type GraphModel,
  installedCapabilityIds,
  type LocalSignals,
  parseActivations,
  projectCatalogV3ToV1,
  type ProjectState,
  type RuntimeEvidence,
  type Score,
  scoreProjectState,
} from '@voidcorp/harness-graph';
import { loadTelemetryStream } from '../lib/graph-io.js';
import { configPackDirs } from '../lib/packs.js';
import { detectedAdapters } from '../lib/runtime-adapters.js';
import { banner, blank, c, footer, line } from '../lib/render.js';
import { freshnessNotice, resolveFreshness } from '@voidcorp/hook-runner';
import { readInstallReceipt } from '../lib/receipts.js';

// dist/main.js -> the package root (packages/cli in the monorepo, node_modules/voidharness once published).
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Candidate paths for a shipped data artifact, in priority order: the monorepo source
 * (`packages/harness-graph/<name>`) first for dev, then the package-local copy
 * (`core-assets/data/<name>`) that ships in the published tarball. Pure — the caller picks the first
 * that exists, so a published CLI runs `status` with no monorepo. */
export function dataCandidates(pkgRoot: string, name: string): string[] {
  return [resolve(pkgRoot, '..', 'harness-graph', name), join(pkgRoot, 'core-assets', 'data', name)];
}
const findData = (name: string): string | undefined => dataCandidates(PKG_ROOT, name).find((p) => existsSync(p));

const DIMENSION_ORDER = ['installation', 'portability', 'activation', 'efficacy', 'enforcement', 'dx', 'performance', 'governance'];
const HISTORY_KEEP = 30; // retain the most recent N state snapshots; older ones are pruned each run

/** Keep only the most recent HISTORY_KEEP snapshots (ISO-timestamp filenames sort chronologically). */
function pruneHistory(dir: string): void {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - HISTORY_KEEP))) {
    try {
      rmSync(join(dir, f));
    } catch {
      // best-effort pruning; a locked snapshot must not fail the run
    }
  }
}

/** Count skill activations and key them by capability id (activations carry the bare skill name). */
export function usedCountsById(
  events: readonly { kind: string; name: string }[],
  cert: Certification,
): Map<string, number> {
  const nameToId = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const cap of cert.capabilities) {
    const bare = cap.id.replace(/^skill:/, '').split('/').pop() ?? cap.id;
    if (nameToId.has(bare)) ambiguous.add(bare);
    else nameToId.set(bare, cap.id);
  }
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.kind !== 'skill' || ambiguous.has(ev.name)) continue; // a bare name shared by 2+ caps is unattributable
    const id = nameToId.get(ev.name);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The pack directories a project has activated, derived from `.void/config.json`
 * `packs` keys (`@voidcorp/harness-<x>` -> `pack-<x>`). Thin Set wrapper over the
 * shared `configPackDirs` so status, init, and update never diverge on the mapping.
 */
export function activatedPackDirs(config: { packs?: Record<string, string> }): Set<string> {
  return new Set(configPackDirs(config));
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length));

/** Render the ProjectState + score as plain terminal lines (pure — the command adds color + writes). */
export function statusLines(state: ProjectState, score: Score): string[] {
  const out: string[] = [];
  const cap = score.capped ? ` (capped: ${score.blockers.join(', ')})` : '';
  // Honest headline: without behavioral evidence (low confidence) this is a
  // STRUCTURE score (owners/runtimes/enforcement declared), not proven "health".
  // It graduates to PROJECT HEALTH only once real usage/eval evidence exists.
  const headline = score.confidence === 'low' ? 'VOID STRUCTURE SCORE' : 'VOID PROJECT HEALTH ';
  out.push(`${headline}  ${score.global}/100   confidence: ${score.confidence}${cap}`);
  out.push('');
  const byKey = new Map(score.dimensions.map((d) => [d.key, d]));
  for (const key of DIMENSION_ORDER) {
    const d = byKey.get(key);
    if (!d) continue;
    const value = d.score === null || d.score === undefined ? 'pending' : `${d.score}%`;
    const flag = d.kind === 'blocker' ? (d.red ? ' [RED]' : '') : '';
    out.push(`  ${pad(key, 14)} ${pad(value, 8)} ${d.detail ?? ''}${flag}`);
  }
  out.push('');
  const counts = new Map<string, number>();
  for (const s of state.capabilities) counts.set(s.state, (counts.get(s.state) ?? 0) + 1);
  const order = ['effective', 'used', 'verified', 'installed', 'available'];
  out.push(`CAPABILITIES (${state.capabilities.length})`);
  out.push(`  ${order.map((s) => `${counts.get(s) ?? 0} ${s}`).join(' · ')}`);
  out.push('');
  out.push('RUNTIMES');
  const show = (value: boolean | null): string =>
    value === null ? 'unknown' : value ? 'yes' : 'no';
  for (const runtime of state.runtimes) {
    const ev = runtime.evidence;
    out.push(
      `  ${runtime.runtime} installed=${show(ev.installed)} wired=${show(ev.wired)} `
      + `fired=${show(ev.fired)} observed=${show(ev.observed)} certified=${show(ev.certified)}`,
    );
  }
  // Honesty: skill usage is only observable on Claude (its Skill tool fires the
  // meter). When Codex is the only runtime, usage is unmeasurable — activation is
  // pending, and this note explains why a project can look "0 used" yet be active.
  const codexDetected = state.runtimes.some((r) => r.runtime === 'codex' && r.detected);
  const claudeDetected = state.runtimes.some((r) => r.runtime === 'claude' && r.detected);
  if (codexDetected && !claudeDetected) {
    out.push('  note: skill usage is not observable on Codex (no hook event) — activation shows pending, not 0');
  }
  out.push('');
  out.push('NEXT BEST ACTIONS');
  if (score.nextActions.length === 0) out.push('  (none — nothing measurable to improve yet)');
  for (const a of score.nextActions) out.push(`  ${a.rank}. ${pad(a.title, 46)} +${a.impact}`);
  return out;
}

function readJson<T>(path: string): T {
  const parsed: T = JSON.parse(readFileSync(path, 'utf8'));
  return parsed;
}

export async function status(_args: readonly string[]): Promise<void> {
  const cwd = process.cwd();
  const certPath = findData('certification.json');
  if (!certPath) {
    footer(c.red('no certification.json found — reinstall the harness, or run `pnpm certification:build` in the monorepo.'));
    process.exit(1);
  }
  const cert = readJson<Certification>(certPath);
  if (cert.capabilities.length === 0) {
    // A real certification always ships the full capability catalog; an empty one is corrupt, not a
    // legitimately-empty project (the project can be empty; the shipped catalog never is).
    footer(c.red('certification.json has no capabilities — likely corrupt; run `pnpm certification:build`.'));
    process.exit(1);
  }
  const modelPath = findData('model.json');
  const legacyModel: GraphModel = modelPath
    ? readJson<GraphModel>(modelPath)
    : { version: 1, nodes: [], edges: [] };
  const model = projectCatalogV3ToV1(adaptCatalogV1(legacyModel));
  const staticTokensById = new Map<string, number>();
  for (const n of model.nodes) if (typeof n.staticTokens === 'number') staticTokensById.set(n.id, n.staticTokens);

  const events = parseActivations(loadTelemetryStream(cwd, 'activations.jsonl'));
  // Installed = core capabilities + only the packs this project activated (read
  // from .void/config.json). Absent config ⇒ no packs ⇒ core only — never the
  // whole catalog, which overstated the surface.
  const configPath = join(cwd, '.void', 'config.json');
  const config = existsSync(configPath) ? readJson<{ packs?: Record<string, string> }>(configPath) : {};
  const declaredIds = installedCapabilityIds(
    cert.capabilities.map((cp) => cp.id),
    activatedPackDirs(config),
  );
  const inspections = await Promise.all(
    detectedAdapters(cwd).map((adapter) => adapter.inspect(cwd)),
  );
  const operational = new Map<string, (typeof inspections)[number]['evidence']>(
    inspections.map((inspection) => [
    inspection.runtime,
    inspection.evidence,
    ]),
  );
  const installedIds = new Set<string>();
  const verifiedIds = new Set<string>();
  for (const cap of cert.capabilities) {
    if (!declaredIds.has(cap.id)) continue;
    const evidence = cap.runtimes
      .map((runtime) => operational.get(runtime))
      .filter((value) => value !== undefined);
    if (evidence.some((value) => value.installed === true)) installedIds.add(cap.id);
    if (evidence.some((value) => value.wired === true && value.fired === true)) {
      verifiedIds.add(cap.id);
    }
  }
  const runtimeEvidence = new Map<string, RuntimeEvidence>();
  for (const inspection of inspections) {
    const relevant = cert.capabilities.filter((cap) =>
      declaredIds.has(cap.id)
      && cap.runtimes.includes(inspection.runtime),
    );
    const certified = relevant.length === 0
      ? null
      : relevant.every((cap) => cap.proof.verified);
    runtimeEvidence.set(inspection.runtime, {
      ...inspection.evidence,
      certified,
    });
  }
  const signals: LocalSignals = {
    installedIds,
    verifiedIds,
    usedCounts: usedCountsById(events, cert),
    runtimeEvidence,
  };

  const state = computeProjectState(cert, signals, cert.harnessVersion);
  const score = scoreProjectState(state, cert, staticTokensById);

  banner('status');
  blank();
  for (const l of statusLines(state, score)) line(l);

  // Persist first (best-effort), then report the TRUE outcome — never claim a write that failed.
  let persisted = false;
  try {
    const generatedAt = new Date().toISOString();
    const body = `${JSON.stringify({ ...state, generatedAt, score }, null, 2)}\n`;
    // Observed state: a snapshot of what this machine measured, plus its history.
    const localDir = voidLocalDir(cwd);
    const historyDir = join(localDir, 'history');
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(join(localDir, 'state.json'), body);
    writeFileSync(join(historyDir, `${generatedAt.replace(/[:.]/g, '-')}.json`), body);
    pruneHistory(historyDir);
    persisted = true;
  } catch {
    // a read-only .void must not fail the render — but we must not claim a write that did not happen
  }
  blank();
  if (score.capped) line(c.red(`  score capped by ${score.blockers.join(', ')}`));

  // Advisory, and last: an outdated install still works, so this never touches the
  // score. Answered from cache when one is fresh, so `status` normally stays offline.
  const receipt = await readInstallReceipt(cwd);
  const notice = freshnessNotice(
    await resolveFreshness({
      installed: receipt?.version ?? 'unknown',
      env: process.env,
      now: Date.now(),
    }),
    receipt?.source,
  );
  if (notice !== undefined) line(c.yellow(`  ${notice}`));

  footer(persisted ? c.green('state written to .void/local/state.json') : c.dim('.void not writable — render only'));
}
