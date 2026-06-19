// The outbound self-evolution audit (issue #17 cluster C): read .void/usage.log
// (written by the skill-usage-meter hook, one `<iso>\t<skill>` line per Skill
// invocation) and classify each harness skill as active / stale / never-used —
// the signal a human weighs when proposing a deprecation. Pure + clock-injected
// so the command can stay a thin reader/renderer (functional core / shell).

/** One parsed usage-log line. */
export interface UsageEntry {
  readonly timestamp: string;
  readonly skill: string;
}

export type SkillStatus = 'active' | 'stale' | 'never';

export interface SkillAudit {
  readonly skill: string;
  /** ISO timestamp of the most recent invocation, or undefined if never. */
  readonly lastUsed: string | undefined;
  /** Whole days since the last use, or undefined (never used / unparseable). */
  readonly daysSince: number | undefined;
  readonly status: SkillStatus;
}

export interface AuditReport {
  readonly active: readonly SkillAudit[];
  readonly stale: readonly SkillAudit[];
  readonly never: readonly SkillAudit[];
  readonly staleDays: number;
}

const DAY_MS = 86_400_000;

/** Parse the usage log into entries; blank/malformed lines are dropped. */
export function parseUsageLog(text: string): UsageEntry[] {
  const out: UsageEntry[] = [];
  for (const raw of text.split('\n')) {
    const tab = raw.indexOf('\t');
    if (tab < 0) continue;
    const timestamp = raw.slice(0, tab).trim();
    const skill = raw.slice(tab + 1).trim();
    if (timestamp === '' || skill === '') continue;
    out.push({ timestamp, skill });
  }
  return out;
}

/** Most recent usage timestamp for a skill (ISO sorts lexicographically). */
function latestUse(usage: readonly UsageEntry[], skill: string): string | undefined {
  let latest: string | undefined;
  for (const entry of usage) {
    if (entry.skill !== skill) continue;
    if (latest === undefined || entry.timestamp > latest) latest = entry.timestamp;
  }
  return latest;
}

/**
 * Classify each supplied harness skill against the usage log. Foreign entries
 * (other plugins) are ignored — the audit only judges the skills we own.
 */
export function auditSkills(input: {
  readonly allSkills: readonly string[];
  readonly usage: readonly UsageEntry[];
  readonly nowMs: number;
  readonly staleDays: number;
}): AuditReport {
  const active: SkillAudit[] = [];
  const stale: SkillAudit[] = [];
  const never: SkillAudit[] = [];

  for (const skill of input.allSkills) {
    const lastUsed = latestUse(input.usage, skill);
    if (lastUsed === undefined) {
      never.push({ skill, lastUsed: undefined, daysSince: undefined, status: 'never' });
      continue;
    }
    const usedMs = Date.parse(lastUsed);
    const daysSince = Number.isNaN(usedMs) ? undefined : Math.floor((input.nowMs - usedMs) / DAY_MS);
    const isStale = daysSince !== undefined && daysSince > input.staleDays;
    const audit: SkillAudit = { skill, lastUsed, daysSince, status: isStale ? 'stale' : 'active' };
    (isStale ? stale : active).push(audit);
  }

  return { active, stale, never, staleDays: input.staleDays };
}
