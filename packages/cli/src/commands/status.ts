// `void-harness status` — the deterministic, offline, LLM-free project health surface.
// Gathers local signals, joins them with the frozen certification into a ProjectState + score,
// renders the terminal view, and persists .void/state.json (+ a history snapshot).

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Certification,
  computeProjectState,
  type GraphModel,
  installedCapabilityIds,
  type LocalSignals,
  parseActivations,
  type ProjectState,
  type Score,
  scoreProjectState,
} from '@voidcorp/harness-graph';
import { banner, blank, c, footer, line } from '../lib/render.js';

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
 * `packs` keys. A key is `@voidcorp/harness-<x>`; the matching capability pack dir
 * is `pack-<x>` (the marketplace name `harness-monorepo` maps to the source dir
 * `pack-monorepo`). The core entry (`@voidcorp/harness`) is not a pack. Pure.
 */
export function activatedPackDirs(config: { packs?: Record<string, string> }): Set<string> {
  const dirs = new Set<string>();
  for (const key of Object.keys(config.packs ?? {})) {
    const name = key.replace(/^@voidcorp\//, '');
    if (name === 'harness' || !name.startsWith('harness-')) continue;
    dirs.add(name.replace(/^harness-/, 'pack-'));
  }
  return dirs;
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length));

/** Render the ProjectState + score as plain terminal lines (pure — the command adds color + writes). */
export function statusLines(state: ProjectState, score: Score): string[] {
  const out: string[] = [];
  const cap = score.capped ? ` (capped: ${score.blockers.join(', ')})` : '';
  out.push(`VOID PROJECT HEALTH   ${score.global}/100   confidence: ${score.confidence}${cap}`);
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
  out.push(`  ${state.runtimes.map((r) => `${r.runtime} ${r.detected ? 'verified' : 'missing'}`).join(' · ')}`);
  // Honesty: skill usage is counted from observable invocations (Claude's Skill
  // tool). Codex loads skills as context and fires no hook event for them, so on
  // a Codex project the counts reflect Claude usage only — never read a low count
  // as "these skills aren't used".
  if (state.runtimes.some((r) => r.runtime === 'codex' && r.detected)) {
    out.push('  note: usage reflects observable (Claude) skill invocations — Codex does not surface skill use');
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

function detectRuntimes(cwd: string): Set<string> {
  const detected = new Set<string>();
  if (existsSync(join(cwd, 'CLAUDE.md'))) detected.add('claude');
  if (existsSync(join(cwd, 'AGENTS.md'))) detected.add('codex');
  return detected;
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
  const model = modelPath ? readJson<GraphModel>(modelPath) : { version: 1, nodes: [], edges: [] };
  const staticTokensById = new Map<string, number>();
  for (const n of model.nodes) if (typeof n.staticTokens === 'number') staticTokensById.set(n.id, n.staticTokens);

  const actPath = join(cwd, '.void', 'activations.jsonl');
  const events = existsSync(actPath) ? parseActivations(readFileSync(actPath, 'utf8')) : [];
  // Installed = core capabilities + only the packs this project activated (read
  // from .void/config.json). Absent config ⇒ no packs ⇒ core only — never the
  // whole catalog, which overstated the surface.
  const configPath = join(cwd, '.void', 'config.json');
  const config = existsSync(configPath) ? readJson<{ packs?: Record<string, string> }>(configPath) : {};
  const signals: LocalSignals = {
    installedIds: installedCapabilityIds(
      cert.capabilities.map((cp) => cp.id),
      activatedPackDirs(config),
    ),
    usedCounts: usedCountsById(events, cert),
    runtimesDetected: detectRuntimes(cwd),
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
    const voidDir = join(cwd, '.void');
    const historyDir = join(voidDir, 'history');
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(join(voidDir, 'state.json'), body);
    writeFileSync(join(historyDir, `${generatedAt.replace(/[:.]/g, '-')}.json`), body);
    pruneHistory(historyDir);
    persisted = true;
  } catch {
    // a read-only .void must not fail the render — but we must not claim a write that did not happen
  }
  blank();
  if (score.capped) line(c.red(`  score capped by ${score.blockers.join(', ')}`));
  footer(persisted ? c.green('state written to .void/state.json') : c.dim('.void not writable — render only'));
}
