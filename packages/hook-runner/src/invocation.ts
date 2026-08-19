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

interface JournalEvent {
  readonly kind: string;
  readonly missionId: string;
  readonly category: string;
  readonly subject: string;
  readonly ts: string;
}

/**
 * Walk a journal body without materialising it.
 *
 * A truncated line is a rotated journal, never a reason to fail a session, so
 * every unreadable line is skipped rather than thrown on.
 */
function eachEvent(body: string, visit: (event: JournalEvent) => void): void {
  for (const line of body.split('\n')) {
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const record = parsed as Record<string, unknown>;
    const payload = record['payload'];
    const category =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)['category']
        : undefined;
    visit({
      kind: typeof record['kind'] === 'string' ? record['kind'] : '',
      missionId: typeof record['missionId'] === 'string' ? record['missionId'] : '',
      category: typeof category === 'string' ? category : '',
      subject: typeof record['subject'] === 'string' ? record['subject'] : '',
      ts: typeof record['ts'] === 'string' ? record['ts'] : '',
    });
  }
}

/** Bare skill names recorded as fired in a journal body. */
function recordedSkillNames(body: string): string[] {
  const names: string[] = [];
  eachEvent(body, (event) => {
    if (event.kind !== 'runtime.tool.started' || event.category !== 'skill') return;
    if (!event.subject.startsWith('skill:')) return;
    names.push(bareName(event.subject.slice('skill:'.length)));
  });
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
 * The block a session opening carries when the surface is broken, or nothing.
 *
 * Silence in the healthy case is the whole design: a banner that speaks every
 * session is a banner nobody reads, and this alert only has to survive until
 * someone acts on it once. Lines rather than one sentence, because the banner
 * already runs long and a run-on clause at its end is what gets skipped.
 *
 * Plain text on purpose: this is injected into the model's context, not printed
 * to a terminal, so ANSI colour would be parasite text rather than colour. The
 * coloured rendering of the same verdicts belongs to `doctor`.
 */
export function invocationAlert(
  resolution: ResolutionVerdict,
  liveness: LivenessVerdict,
): string | undefined {
  if (resolution.ok && liveness.ok) return undefined;
  const lines = ['void-harness, invocation surface:'];
  if (!resolution.ok) {
    const named = resolution.unresolved.slice(0, MAX_NAMED).join(', ');
    const rest = resolution.unresolved.length - MAX_NAMED;
    const tail = rest > 0 ? `, and ${rest} more` : '';
    lines.push(
      `  ${resolution.unresolved.length} recorded skill invocation(s) name a skill this project cannot resolve: ${named}${tail}`,
    );
  }
  if (!liveness.ok) {
    lines.push(
      `  no skill fired in the last ${liveness.missions} working missions (${liveness.toolCalls} tool calls)`,
    );
  }
  lines.push('  run `void-harness doctor` for the detail');
  return lines.join('\n');
}

/**
 * Whether skills are still being reached at all.
 *
 * A silence proves nothing on its own: a session spent reading code fires no
 * skill and is perfectly healthy. It only means something against missions that
 * demonstrably worked, and work is counted in **tool calls** -- never in hooks,
 * which belong to enforcement and would make this verdict drift the day the
 * floor gains or loses a rule.
 */
export interface LivenessVerdict {
  readonly ok: boolean;
  /** Working missions actually judged, capped at the window. */
  readonly missions: number;
  /** Tool calls across those missions, the evidence that they worked. */
  readonly toolCalls: number;
  /** Skill activations across those missions. Context for `doctor`, never a threshold. */
  readonly skillCalls: number;
}

/** Tool calls below which a mission proves nothing and is not judged. */
const WORKING_MISSION_CALLS = 20;
/** Working missions that must all be silent before the surface is called dead. */
const LIVENESS_WINDOW = 3;

interface MissionTally {
  toolCalls: number;
  skillCalls: number;
  lastTs: string;
}

export function livenessVerdict(body: string): LivenessVerdict {
  const tallies = new Map<string, MissionTally>();
  eachEvent(body, (event) => {
    if (event.kind !== 'runtime.tool.started' || event.missionId === '') return;
    const tally = tallies.get(event.missionId) ?? { toolCalls: 0, skillCalls: 0, lastTs: '' };
    tally.toolCalls += 1;
    if (event.category === 'skill') tally.skillCalls += 1;
    if (event.ts > tally.lastTs) tally.lastTs = event.ts;
    tallies.set(event.missionId, tally);
  });

  const judged = [...tallies.values()]
    .filter((tally) => tally.toolCalls >= WORKING_MISSION_CALLS)
    .sort((a, b) => (a.lastTs < b.lastTs ? 1 : a.lastTs > b.lastTs ? -1 : 0))
    .slice(0, LIVENESS_WINDOW);

  const toolCalls = judged.reduce((total, tally) => total + tally.toolCalls, 0);
  const skillCalls = judged.reduce((total, tally) => total + tally.skillCalls, 0);
  // Under a full window there is no verdict to give: two silent missions are a
  // quiet week, and crying on them is how a guardrail gets turned off.
  const ok = judged.length < LIVENESS_WINDOW || judged.some((tally) => tally.skillCalls > 0);
  return { ok, missions: judged.length, toolCalls, skillCalls };
}
