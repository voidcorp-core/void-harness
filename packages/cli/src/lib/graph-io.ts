import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMissionJournals } from '@voidcorp/hook-runner';
import { parseActivations } from '@voidcorp/harness-graph';
import { type UsageEntry, parseUsageLog } from './audit.js';

/**
 * Read canonical mission logs in stable order.
 *
 * The reader itself lives in `hook-runner`, because the session banner needs the
 * same journals and cannot depend on this package. Both locations are read, so a
 * project mid-migration keeps its whole history; the half-migrated state is
 * reported as a defect by `doctor`, not hidden by the reader.
 */
export function loadCanonicalEventBody(root: string): string {
  return readMissionJournals(root);
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
