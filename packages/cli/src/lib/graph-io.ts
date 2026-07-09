import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseActivations } from '@voidcorp/harness-graph';
import { type UsageEntry, parseUsageLog } from './audit.js';

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
 * Skill-firing UsageEntries from a `.void/activations.jsonl` body: the rich meter
 * writes one JSON event per tool call; we keep only `kind: "skill"` and map it to
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
 * The single skill-usage source of truth (issue #70). `activations.jsonl` is
 * authoritative (rich, every tool call, jq-or-fallback written); the legacy
 * `usage.log` is merged in only as transition history so a consumer's existing
 * "stale" stats are not reset. Consumers (auditSkills, usedSkillNames) reduce by
 * max timestamp, so the overlap between the two files is harmless.
 */
export function loadSkillUsage(root: string): UsageEntry[] {
  const voidDir = join(root, '.void');
  const activations = join(voidDir, 'activations.jsonl');
  const legacy = join(voidDir, 'usage.log');
  const fromActivations = existsSync(activations)
    ? skillActivationsToUsage(readFileSync(activations, 'utf8'))
    : [];
  const fromLegacy = existsSync(legacy) ? parseUsageLog(readFileSync(legacy, 'utf8')) : [];
  return [...fromActivations, ...fromLegacy];
}
