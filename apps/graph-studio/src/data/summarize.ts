import type { UsageSummary } from './types.js';

/** Strip an optional `plugin:` prefix, returning the bare component name. */
function bareName(raw: string): string {
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

/** Summarize a `.void/usage.log` (lines: `ISO-ts<TAB>name`) into counts + distinct names. Pure. */
export function summarizeUsage(logText: string): UsageSummary {
  const counts: Record<string, number> = {};
  for (const line of logText.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const name = bareName(line.slice(tab + 1).trim());
    if (name === '') continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return { counts, usedSkillNames: Object.keys(counts).sort() };
}

export function summarizeActivations(
  events: readonly { readonly kind: string; readonly name: string }[],
): UsageSummary {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (event.kind !== 'skill') continue;
    const name = bareName(event.name);
    if (name === '') continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return { counts, usedSkillNames: Object.keys(counts).sort() };
}
