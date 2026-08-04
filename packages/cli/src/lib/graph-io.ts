import {
  type Dirent,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { legacyVoidPath, voidLocalPath } from '@voidcorp/hook-runner';
import { parseActivations } from '@voidcorp/harness-graph';
import { type UsageEntry, parseUsageLog } from './audit.js';

const MISSION_DIRECTORY = /^mis_[A-Za-z0-9_-]{8,100}$/;
const MAX_MISSION_LOGS = 10_000;
const MAX_CANONICAL_BYTES = 64 * 1024 * 1024;

function safeRegularFile(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Read canonical mission logs in stable order. Discovery is bounded and rejects
 * symlinks so local telemetry cannot turn a CLI read into an arbitrary file read.
 */
export function loadCanonicalEventBody(root: string): string {
  // Both halves, not one: a project mid-migration has missions at the pre-split
  // path and newer ones under `local/`. Reading whichever exists first would
  // report a project's older history as absent for as long as it takes to run
  // `update` — and silently drop it for a project that never does.
  const bodies = [voidLocalPath(root, 'runs'), legacyVoidPath(root, 'runs')]
    .filter((directory, index, all) => all.indexOf(directory) === index)
    .map((directory) => readRunDirectory(directory));
  return bodies.filter((body) => body !== '').join('\n');
}

function readRunDirectory(runs: string): string {
  try {
    const info = lstatSync(runs);
    if (!info.isDirectory() || info.isSymbolicLink()) return '';
  } catch {
    return '';
  }
  const parts: string[] = [];
  let bytes = 0;
  let entries: Dirent[];
  try {
    entries = readdirSync(runs, { withFileTypes: true })
      .filter((entry) =>
        entry.isDirectory()
        && !entry.isSymbolicLink()
        && MISSION_DIRECTORY.test(entry.name),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_MISSION_LOGS);
  } catch {
    return '';
  }
  for (const entry of entries) {
    const path = join(runs, entry.name, 'events.jsonl');
    if (!safeRegularFile(path)) continue;
    try {
      const size = statSync(path).size;
      if (size > MAX_CANONICAL_BYTES || bytes + size > MAX_CANONICAL_BYTES) break;
      parts.push(readFileSync(path, 'utf8'));
      bytes += size;
    } catch {
      // A concurrently rotated or unreadable log is skipped.
    }
  }
  return parts.join('\n');
}

/** Canonical stream plus one legacy transition stream during the v2 -> v3 migration. */
export function loadTelemetryStream(root: string, legacyFile: string): string {
  const canonical = loadCanonicalEventBody(root);
  // Same reason as the run journals: a legacy stream may sit at either path.
  const legacyBody = [voidLocalPath(root, legacyFile), legacyVoidPath(root, legacyFile)]
    .filter((path, index, all) => all.indexOf(path) === index)
    .filter((path) => safeRegularFile(path))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  return [canonical, legacyBody].filter((body) => body !== '').join('\n');
}

/** Bare skill names that have fired (drop the `<plugin>:` prefix, dedupe). */
export function usedSkillNames(usage: readonly UsageEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of usage) {
    const colon = e.skill.lastIndexOf(':');
    out.add(colon >= 0 ? e.skill.slice(colon + 1) : e.skill);
  }
  return out;
}

/**
 * Skill-firing UsageEntries from canonical or legacy event JSONL. Keep only
 * `kind: "skill"` and map it to
 * the `{ timestamp, skill }` shape the audit/graph consume. Reuses the graph
 * package's tolerant line parser (bad/truncated lines are skipped).
 */
export function skillActivationsToUsage(text: string): UsageEntry[] {
  const out: UsageEntry[] = [];
  for (const ev of parseActivations(text)) {
    if (ev.kind !== 'skill' || ev.ts === '' || ev.name === '') continue;
    out.push({ timestamp: ev.ts, skill: ev.name });
  }
  return out;
}

/**
 * Canonical mission events are authoritative. Legacy activation/usage streams
 * are merged as transition history so existing "stale" stats are not reset.
 * Consumers reduce by max timestamp, so overlap is harmless.
 */
export function loadSkillUsage(root: string): UsageEntry[] {
  const fromActivations = skillActivationsToUsage(
    loadTelemetryStream(root, 'activations.jsonl'),
  );
  const fromLegacy = [voidLocalPath(root, 'usage.log'), legacyVoidPath(root, 'usage.log')]
    .filter((path, index, all) => all.indexOf(path) === index)
    .filter((path) => existsSync(path))
    .flatMap((path) => parseUsageLog(readFileSync(path, 'utf8')));
  return [...fromActivations, ...fromLegacy];
}
