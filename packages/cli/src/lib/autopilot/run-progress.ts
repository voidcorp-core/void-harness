// Whether a run is working, and where it is, for someone with no terminal.
//
// The cycle became unattended one slice before this, and its gate -- "no human
// interaction between launch and the pull request" -- is satisfied by a run
// that stalls silently at minute ten and contradicted by nothing. Six hours
// later a person finds no pull request and cannot tell whether it is still
// going, whether it died, or whether it never started. All three look the same
// from outside, and only one of them is worth waiting for.
//
// So the run beats. Every decision leaves a mark carrying the instant, the step,
// the unit and the budget, and a silence longer than one unit's ceiling becomes
// a readable fact rather than an absence someone has to interpret.
//
// Pure, and the instant arrives as an argument: a liveness judgement that reads
// its own clock cannot be tested against the silence it exists to detect.

/** One decision, marked where a reader can see it. */
export interface RunBeat {
  /** ISO instant the decision was taken. */
  readonly at: string;
  /** Which step of the cycle produced it. */
  readonly step: string;
  /** The unit it concerned, or the one it was about to take. */
  readonly unit?: string;
  readonly spentMs: number;
  readonly remainingMs: number;
}

export type LivenessKind = 'unstarted' | 'alive' | 'stalled' | 'ended';

export interface Liveness {
  readonly kind: LivenessKind;
  readonly detail: string;
}

export interface LivenessObservation {
  readonly beats: readonly RunBeat[];
  /** ISO instant of the reading. */
  readonly now: string;
  /** Longest a single unit may take before its silence means something. */
  readonly unitCeilingMs: number;
  /** Whether the chain reported a stop. An ended run is never stalled. */
  readonly ended: boolean;
}

const MINUTE_MS = 60_000;

function describe(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE_MS));
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h${String(rest)}m`;
}

/** Milliseconds between two ISO instants, or null when either is unreadable. */
function since(from: string, to: string): number | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isNaN(start) || Number.isNaN(end) ? null : end - start;
}

/**
 * What the silence since the last beat means.
 *
 * The four answers are deliberately distinct. A run that never beat has not
 * started; one that ended is finished however old its last mark; one that is
 * quiet within the ceiling is working; and one quiet beyond it has stopped
 * without saying so, which is the only one that needs a person.
 */
export function judgeLiveness(observation: LivenessObservation): Liveness {
  const last = observation.beats[observation.beats.length - 1];
  if (last === undefined) {
    return {
      kind: 'unstarted',
      detail: 'no decision has been taken yet; the run has not reached its first step',
    };
  }
  const named = last.unit === undefined ? last.step : `${last.step} on ${last.unit}`;
  if (observation.ended) {
    return { kind: 'ended', detail: `the run ended at ${named}` };
  }
  const quiet = since(last.at, observation.now);
  if (quiet === null) {
    // An unreadable clock is not a healthy run. Reporting it as alive would be
    // the one reading that cannot be corrected by waiting.
    return {
      kind: 'stalled',
      detail: `the last beat carries an instant nothing can read (${last.at}); treat the run as stopped`,
    };
  }
  if (quiet > observation.unitCeilingMs) {
    return {
      kind: 'stalled',
      detail: `no beat for ${describe(quiet)}, longer than the ${describe(observation.unitCeilingMs)} one unit may take; the last was ${named}`,
    };
  }
  return { kind: 'alive', detail: `last beat ${describe(quiet)} ago, at ${named}` };
}

export interface ProgressInput {
  readonly runId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly beats: readonly RunBeat[];
  readonly liveness: Liveness;
  /** The merge journal as `renderMergeJournal` produced it. */
  readonly journal: string;
}

const HEADLINE: Readonly<Record<LivenessKind, string>> = Object.freeze({
  unstarted: 'STARTING',
  alive: 'ALIVE',
  stalled: 'STALLED — this run has stopped without saying so',
  ended: 'ENDED',
});

/**
 * The body of the draft pull request, rewritten after every decision.
 *
 * The state and the last unit come first because a phone shows six lines. What
 * a reader needs in those six is whether to keep waiting and what it was doing
 * when it last spoke; everything else is below and can be scrolled to.
 */
export function renderRunProgress(input: ProgressInput): string {
  const last = input.beats[input.beats.length - 1];
  const lines = [
    `**${HEADLINE[input.liveness.kind]}** — ${input.liveness.detail}`,
    '',
    `Run \`${input.runId}\` on \`${input.base.branch}\` at \`${input.base.sha.slice(0, 7)}\`.`,
  ];
  if (last !== undefined) {
    lines.push(
      `Last: **${last.unit ?? last.step}** at ${last.step}, ${describe(last.spentMs)} spent, `
        + `**${describe(last.remainingMs)} left**.`,
    );
  }
  lines.push(
    '',
    '## What merged so far',
    '',
    input.journal,
    '',
    '## Every decision, in order',
    '',
    ...(input.beats.length === 0
      ? ['Nothing yet.']
      : input.beats.map((entry) =>
          `- \`${entry.at}\` ${entry.step}${entry.unit === undefined ? '' : ` — ${entry.unit}`}`
            + ` (${describe(entry.remainingMs)} left)`)),
    '',
    'This body is rewritten after every decision, so its age is the run\'s age.',
    '',
  );
  return lines.join('\n');
}
