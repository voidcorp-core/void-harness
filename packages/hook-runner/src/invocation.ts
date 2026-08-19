import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Whether the invocation surface is still reachable, judged from what the
 * harness recorded about itself.
 *
 * The harness is blind to its own refused calls: a `Skill` invocation under an
 * unknown name is rejected by the runtime before the first hook runs, and writes
 * no event at all (measured 2026-08-19, journal unchanged to the byte). So the
 * panne itself is unobservable, and only its traces are: a name that was
 * recorded and no longer resolves, or a silence where activations should be.
 *
 * The reference is the skills actually installed on disk, not a compiled
 * catalogue. The question being asked is "does this name resolve here, now",
 * which is what the directory answers and a model of it only approximates.
 */
export interface ResolutionVerdict {
  readonly ok: boolean;
  /** Recorded skill names with no installed skill behind them, sorted, deduped. */
  readonly unresolved: readonly string[];
}

const SKILL_RUNTIME_DIRS = ['.claude', '.agents'] as const;

/** Strip any plugin namespace (`harness:tdd` -> `tdd`), the form the defect was recorded under. */
function bareName(raw: string): string {
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

/** The skills a runtime could actually resolve in this project. */
export function installedSkillNames(root: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const runtime of SKILL_RUNTIME_DIRS) {
    const skills = join(root, runtime, 'skills');
    let entries;
    try {
      entries = readdirSync(skills, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      // A directory without a SKILL.md resolves to nothing, so it is not a skill
      // however much its name suggests one.
      if (!entry.isDirectory()) continue;
      if (existsSync(join(skills, entry.name, 'SKILL.md'))) names.add(entry.name);
    }
  }
  return names;
}

/** Bare skill names recorded as fired in a journal body. */
function recordedSkillNames(body: string): string[] {
  const names: string[] = [];
  for (const line of body.split('\n')) {
    if (line === '') continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      // A truncated line is a rotated journal, never a reason to fail a session.
      continue;
    }
    if (typeof event !== 'object' || event === null) continue;
    const record = event as Record<string, unknown>;
    if (record['kind'] !== 'runtime.tool.started') continue;
    const payload = record['payload'];
    if (typeof payload !== 'object' || payload === null) continue;
    if ((payload as Record<string, unknown>)['category'] !== 'skill') continue;
    const subject = record['subject'];
    if (typeof subject !== 'string' || !subject.startsWith('skill:')) continue;
    names.push(bareName(subject.slice('skill:'.length)));
  }
  return names;
}

/** The names this project recorded that it can no longer resolve. */
export function resolutionVerdict(body: string, installed: ReadonlySet<string>): ResolutionVerdict {
  const unresolved = [...new Set(recordedSkillNames(body).filter((name) => !installed.has(name)))].sort();
  return { ok: unresolved.length === 0, unresolved };
}

/** How many names the banner spells out before falling back to a count. */
const MAX_NAMED = 5;

/**
 * The one line a session opening carries when the surface is broken, or nothing.
 *
 * Silence in the healthy case is the whole design: a banner that speaks every
 * session is a banner nobody reads, and this alert only has to survive until
 * someone acts on it once.
 */
export function invocationAlert(verdict: ResolutionVerdict): string | undefined {
  if (verdict.ok) return undefined;
  const named = verdict.unresolved.slice(0, MAX_NAMED).join(', ');
  const rest = verdict.unresolved.length - MAX_NAMED;
  const tail = rest > 0 ? `, and ${rest} more` : '';
  return (
    `void-harness: ${verdict.unresolved.length} recorded skill invocation(s) name a skill this `
    + `project cannot resolve (${named}${tail}). Run \`void-harness doctor\` for the detail.`
  );
}
