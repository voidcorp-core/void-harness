// When an autopilot run may take the next ticket, and when it must stop.
//
// Merge autonomy without a stop is not autonomy, it is an unattended failure
// multiplier: the value of chaining comes from the chain ending the moment the
// base stops being trustworthy. One bad merge must not become ten.
//
// Pure. This judges observations and decides; the skill performs the merge, runs
// the suite and reports. Nothing here contacts anything.

import type { UnionVerdict } from './union-review.js';

/** What one merge put on the base, and what it rested on. */
export interface MergedUnit {
  readonly tickets: readonly string[];
  /** Head of the integration branch the union verdict was bound to. */
  readonly integrationSha: string;
  /** The commit the merge produced on the base. */
  readonly mergeCommit: string;
  readonly unionVerdict: UnionVerdict;
  /** Required checks observed green on the integration head. */
  readonly checks: readonly string[];
}

/**
 * The state of the base after a merge landed on it.
 *
 * `undefined` is not a fourth state, it is the absence of the observation, and it
 * stops the chain exactly like a red one. A base nobody verified and a base that
 * failed are indistinguishable from here, and only one of them is safe.
 */
export type PostMergeObservation =
  | { readonly kind: 'green'; readonly sha: string; readonly suite: string }
  | { readonly kind: 'red'; readonly sha: string; readonly failing: readonly string[] };

/**
 * Where a unit this run took ended up.
 *
 * Three ends, and none of them is "remaining". Measured on 2026-09-02: the only
 * state the chain knew was `merged`, so a unit published and handed to a person
 * counted as still ready, and the next decision proposed it again -- to a caller
 * that would have started a second worker on a ticket whose pull request was
 * open. A unit is taken once. What it became is a fact about it, not a reason
 * to take it again.
 *
 * `unit-blocked` rather than `blocked`, because the skill page that documents
 * this table also documents the `status` verdict of that name, which is about a
 * pull request -- closed unmerged, on a foreign branch, merged with no commit.
 * Two reader-facing states cannot share a word on the same page, and this is the
 * one nothing had ever produced, so it is the one that moves.
 */
export type TakenOutcome = 'merged' | 'published-awaiting-human' | 'unit-blocked';

export interface TakenUnit {
  readonly tickets: readonly string[];
  readonly outcome: TakenOutcome;
}

export type ChainStopReason =
  | 'post-merge-red'
  | 'post-merge-unverified'
  | 'post-merge-stale'
  | 'budget-spent'
  | 'budget-unreadable'
  | 'awaiting-human'
  | 'nothing-ready';

export type ChainDecision =
  | { readonly kind: 'continue'; readonly detail: string }
  | {
      readonly kind: 'stop';
      readonly reason: ChainStopReason;
      /** True when the run ended on a problem rather than on running out of work. */
      readonly failed: boolean;
      readonly detail: string;
      readonly fix: string;
    };

const MINUTE_MS = 60_000;

/**
 * How long an unattended run works before handing back.
 *
 * Time rather than a ticket count, because time is what someone actually means:
 * "drain the backlog while I am out" is a duration, and a count of five says
 * nothing about whether that is twenty minutes or a day. Two hours is the length
 * of a session someone waits through and still reads afterwards. See the
 * unattended-run-is-bounded-by-time decision.
 */
export const DEFAULT_CHAIN_BUDGET_MS = 120 * MINUTE_MS;

/** Past this, one run produces more than anyone reviews in a sitting. */
const MAX_CHAIN_BUDGET_MS = 24 * 60 * MINUTE_MS;

/**
 * What a unit is assumed to take, until this run has finished one.
 *
 * A cold estimate, and named as one: it serves for exactly as long as nothing
 * in this run has FINISHED -- merged, or published and handed to a person --
 * and the first finish replaces it outright. A blocked unit is not a finish: it
 * measured how long failing takes, not how long finishing does, so it neither
 * replaces the estimate nor dilutes a measurement. On 2026-09-02 a run had
 * measured 84 minutes for a unit that came back published and unmerged, and
 * still projected the next one at 15, because only a merge counted; the fix
 * that widened "merged" to "taken" then averaged a two-minute failure in with an
 * eighty-minute merge and kept this constant as a floor under the result. Both
 * are gone. Deliberately below anything observed rather than near it -- the job
 * here is to refuse a run that cannot possibly finish a unit, not to second-guess
 * a run that might. See the only-a-finished-unit-measures decision.
 */
const COLD_START_UNIT_MS = 15 * MINUTE_MS;

/**
 * Read a duration a person types: `2h`, `90m`, `1h30m`.
 *
 * Refuses a bare number rather than assuming hours. Someone who writes `6` might
 * mean six hours or six tickets, and guessing which is how an unattended run ends
 * up running for a day.
 */
export function parseChainBudget(text: string): number {
  const match = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i.exec(text);
  const hours = match?.[1];
  const minutes = match?.[2];
  if (match === null || (hours === undefined && minutes === undefined)) {
    throw new Error(`\`${text}\` is not a duration; write it as 2h, 90m or 1h30m`);
  }
  const total = (Number(hours ?? 0) * 60 + Number(minutes ?? 0)) * MINUTE_MS;
  if (total <= 0) throw new Error(`\`${text}\` is not a duration anyone can work for`);
  if (total > MAX_CHAIN_BUDGET_MS) {
    throw new Error(`\`${text}\` is longer than 24h, which is more than anyone reviews in one sitting`);
  }
  return total;
}

/**
 * The budget one run actually gets, from the declaration and what was asked.
 *
 * An invocation may only ever ASK FOR LESS. The programme block is the consent to
 * run unattended, and a consent has a size: letting a command line widen it would
 * make the declared duration a suggestion, and the durable declaration is the
 * whole reason a flag cannot start a machine merge in the first place.
 *
 * A longer request is refused rather than quietly clamped. Someone who types 6h
 * has a plan for six hours, and silently giving them two would have them come
 * back to a run that stopped for no reason they were told about.
 */
/**
 * How long this run may keep taking new units.
 *
 * A written `chainBudget` is a ceiling: someone chose it, in a versioned file,
 * and an invocation may only shorten it -- the declaration is the consent to run
 * unattended, and a consent any command line could widen would not be one.
 *
 * An ABSENT one is a fallback, and the two must not be confused. Nobody consented
 * to two hours by leaving the field out, so refusing an explicit `6h` against it
 * would be a default impersonating a declaration. `declared` is what tells them
 * apart, and it is why this takes a flag rather than inferring one from the
 * value: two hours written by hand and two hours defaulted are the same number
 * and not the same statement.
 */
export function resolveChainBudget(input: {
  readonly declaredMs: number;
  /** True when the programme actually wrote `chainBudget`, false when it fell back. */
  readonly declared: boolean;
  readonly requested?: string | undefined;
}): number {
  if (input.requested === undefined) return input.declaredMs;
  const requested = parseChainBudget(input.requested);
  if (input.declared && requested > input.declaredMs) {
    throw new Error(
      `\`${input.requested}\` is longer than the ${describe(input.declaredMs)} the programme declares;`
      + ' an invocation may shorten a run, never widen it.'
      + ' Raise `autopilot.chainBudget` in `.void/program.md` to run longer.',
    );
  }
  return requested;
}

const short = (sha: string): string => sha.slice(0, 7);

/** A duration as someone would say it, for a message a person reads. */
function describe(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h${String(rest)}m`;
}

function stop(
  reason: ChainStopReason,
  failed: boolean,
  detail: string,
  fix: string,
): ChainDecision {
  return { kind: 'stop', reason, failed, detail, fix };
}

export function planChainStep(input: {
  /** Everything merged so far in this run, oldest first. */
  readonly merged: readonly MergedUnit[];
  /**
   * Every unit this run took, oldest first, merged ones included. The finished
   * ones -- merged, or published and waiting -- are what the budget measures by.
   */
  readonly taken: readonly TakenUnit[];
  /** How long this run may keep taking new units. */
  readonly budgetMs: number;
  /** How long it has been running. */
  readonly elapsedMs: number;
  /** The base after the most recent merge, or undefined if it was not observed. */
  readonly postMerge: PostMergeObservation | undefined;
  /** How many units remain ready to be taken. */
  readonly nextReady: number;
}): ChainDecision {
  // The base first, and deliberately before the cap. A cap reached on a broken
  // base is still a broken base, and reporting "cap" would read as a nominal end
  // and send nobody to look at it.
  const last = input.merged[input.merged.length - 1];
  const base = last === undefined ? undefined : judgeBase(last, input.postMerge);
  if (base !== undefined) return base;

  const budget = judgeBudget(input);
  if (budget !== undefined) return budget;

  // After the budget, on purpose: on 2026-09-02 both were true at once, and the
  // budget is the reading that says why this run is over rather than merely
  // paused on a person. Before `nothing-ready`, also on purpose: a run that
  // handed a unit to someone did not run out of work, it is waiting on them.
  //
  // Another unit would start on the base as it is, without the change the
  // person has not accepted yet. That stacks a second pull request on a first
  // one nobody has read, and turns "the human eye is at the merge" into two
  // merges to reason about at once.
  const waiting = input.taken.filter((unit) => unit.outcome === 'published-awaiting-human');
  if (waiting.length > 0) {
    const named = waiting.flatMap((unit) => unit.tickets).join(', ');
    return stop(
      'awaiting-human',
      false,
      `${named} is published and waiting for a person; another unit would stack on a base`
        + ' that person has not accepted yet',
      'review the pull request; once it is merged or closed, start another run',
    );
  }

  if (input.nextReady <= 0) {
    return stop('nothing-ready', false, 'no unit is ready to take', 'nothing to do; the backlog decides when there is');
  }

  return {
    kind: 'continue',
    detail: `base green after ${String(input.merged.length)} merge(s), ${String(input.nextReady)} unit(s) ready,`
      + ` ${describe(input.budgetMs - input.elapsedMs)} left`,
  };
}

/** Whether the base the last merge produced can be stood on; undefined when it can. */
function judgeBase(
  last: MergedUnit,
  postMerge: PostMergeObservation | undefined,
): ChainDecision | undefined {
  if (postMerge === undefined) {
    return stop(
      'post-merge-unverified',
      true,
      'the merged base was never verified, and an unverified base is not a green one',
      'run the full suite on the base, then decide whether the chain may continue',
    );
  }
  // A verdict about another tree is not a verdict, exactly as `review-stale`
  // reads it on the merge grant. A suite that ran before this merge landed, or
  // on a base someone else has since pushed to, describes a tree the chain is
  // no longer standing on -- and it is the reading a green result would be
  // trusted on.
  if (postMerge.sha !== last.mergeCommit) {
    return stop(
      'post-merge-stale',
      true,
      `the suite was observed on ${short(postMerge.sha)}, and the merge produced`
        + ` ${short(last.mergeCommit)}`,
      'run the full suite on the commit the merge actually produced, then decide',
    );
  }
  if (postMerge.kind === 'red') {
    const named = postMerge.failing.slice(0, 3).join(', ');
    return stop(
      'post-merge-red',
      true,
      `the suite failed on ${short(postMerge.sha)}: ${named}`,
      'fix the base before anything else merges; the next unit was not started',
    );
  }
  return undefined;
}

/** Whether the run may START another unit; undefined when it may. */
function judgeBudget(input: {
  readonly taken: readonly TakenUnit[];
  readonly budgetMs: number;
  readonly elapsedMs: number;
}): ChainDecision | undefined {
  // A budget or a clock that is not a number makes every comparison below false,
  // and `NaN <= 0` is false -- so an unreadable budget used to read as "time
  // left" and continue. The one direction this must never fail in.
  if (
    !Number.isFinite(input.budgetMs) || input.budgetMs <= 0
    || !Number.isFinite(input.elapsedMs) || input.elapsedMs < 0
  ) {
    return stop(
      'budget-unreadable',
      true,
      `the run has no usable budget: ${String(input.budgetMs)}ms given,`
        + ` ${String(input.elapsedMs)}ms elapsed`,
      'give the run a duration it can measure itself against, then start it again',
    );
  }

  const remaining = input.budgetMs - input.elapsedMs;
  if (remaining <= 0) {
    return stop(
      'budget-spent',
      false,
      `the ${describe(input.budgetMs)} given to this run is spent`,
      'read the journal, then start another run if the direction still holds',
    );
  }
  // A unit already under way is never cut in half; the budget decides whether to
  // START another. So the question is not "is there time left" but "is there
  // enough", answered from what this run has actually taken rather than a guess.
  //
  // A run in which nothing has finished has nothing to answer from, and skipping
  // the question there let `for 1m` -- a legal shortening -- start work that
  // takes the better part of an hour, against an ADR that says a run cannot
  // exceed what was declared for it. So such a run is projected against
  // COLD_START_UNIT_MS, and from the first unit that finished the measurement
  // replaces it: the whole elapsed time, failures included, over the units that
  // finished. A blocked unit spent the run's time and is in the numerator; it is
  // not a second unit to divide by. See the only-a-finished-unit-measures
  // decision.
  const finished = input.taken.filter((unit) => unit.outcome !== 'unit-blocked').length;
  const cold = finished === 0;
  const perUnit = cold ? COLD_START_UNIT_MS : input.elapsedMs / finished;
  if (remaining < perUnit) {
    return stop(
      'budget-spent',
      false,
      cold
        ? `${describe(remaining)} left, and nothing this run took has finished yet, so the`
          + ` next unit is projected against the estimate of ${describe(COLD_START_UNIT_MS)};`
          + ' it would not finish inside the budget'
        : `${describe(remaining)} left and each finished unit has taken about`
          + ` ${describe(perUnit)}; the next one would not finish inside the budget`,
      'read the journal, then start another run if the direction still holds',
    );
  }
  return undefined;
}

/**
 * What merged, in order, and on what evidence.
 *
 * Written for the person who reads it after the fact and has to decide whether to
 * trust the result. Which is why it carries the verdict and the checks rather
 * than only the commits: "it merged" is not the question they have.
 */
export function renderMergeJournal(merged: readonly MergedUnit[]): string {
  if (merged.length === 0) return 'Nothing merged in this run.';
  const lines = merged.map((entry, index) => {
    const checks = entry.checks.length === 0 ? 'no checks recorded' : entry.checks.join(', ');
    return [
      `${String(index + 1)}. ${entry.tickets.join(', ')}`,
      `   merged ${short(entry.integrationSha)} as ${short(entry.mergeCommit)}`,
      `   union ${entry.unionVerdict}; checks green: ${checks}`,
    ].join('\n');
  });
  return [`${String(merged.length)} merge(s) in this run:`, ...lines].join('\n');
}
