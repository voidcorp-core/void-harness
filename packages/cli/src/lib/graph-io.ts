import type { UsageEntry } from './audit.js';

/** Bare skill names that have fired (drop the `<plugin>:` prefix, dedupe). */
export function usedSkillNames(usage: readonly UsageEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of usage) {
    const colon = e.skill.lastIndexOf(':');
    out.add(colon >= 0 ? e.skill.slice(colon + 1) : e.skill);
  }
  return out;
}
