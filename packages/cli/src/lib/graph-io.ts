import {
  type Dirent,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { legacyVoidPath, voidMachinePath } from '@voidcorp/hook-runner';
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
  const bodies = [voidMachinePath(root, 'runs'), legacyVoidPath(root, 'runs')]
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
/**
 * The canonical mission journal, and only that.
 *
 * The pre-journal streams (`activations.jsonl`, `outcomes.jsonl`, `usage.log`)
 * stopped being read on 2026-08-18. Nothing had written them for versions — a
 * skill firing is recorded canonically as `runtime.tool.started` with
 * `subject: skill:<name>` — so what remained was a code path whose only effect
 * was to keep OLD history alive. That is precisely what made a skill last used
 * months ago still count as active, which is the opposite of what `audit` is
 * for.
 *
 * The files themselves stay classified as observed, so they are still ignored
 * and still swept into `machine/` by the migration. Retiring a reader is not
 * the same as deleting someone's data.
 *
 * `legacyFile` is kept in the signature: callers name the stream they mean, and
 * the parameter documents which one no longer answers.
 */
export function loadTelemetryStream(root: string, _legacyFile: string): string {
  return loadCanonicalEventBody(root);
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

/** Skill usage, from the canonical journal. See `loadTelemetryStream`. */
export function loadSkillUsage(root: string): UsageEntry[] {
  return skillActivationsToUsage(loadTelemetryStream(root, 'activations.jsonl'));
}
