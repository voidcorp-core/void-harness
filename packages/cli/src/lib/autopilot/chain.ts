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

export type ChainStopReason =
  | 'post-merge-red'
  | 'post-merge-unverified'
  | 'cap-reached'
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

/**
 * How many merges an unattended run makes before handing back.
 *
 * A bound, not a target. Its job is to keep the blast radius of a wrong decision
 * finite and to give a person something to read while the work is still fresh.
 */
export const DEFAULT_CHAIN_CAP = 5;

const short = (sha: string): string => sha.slice(0, 7);

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
  readonly cap: number;
  /** The base after the most recent merge, or undefined if it was not observed. */
  readonly postMerge: PostMergeObservation | undefined;
  /** How many units remain ready to be taken. */
  readonly nextReady: number;
}): ChainDecision {
  // The base first, and deliberately before the cap. A cap reached on a broken
  // base is still a broken base, and reporting "cap" would read as a nominal end
  // and send nobody to look at it.
  if (input.merged.length > 0) {
    if (input.postMerge === undefined) {
      return stop(
        'post-merge-unverified',
        true,
        'the merged base was never verified, and an unverified base is not a green one',
        'run the full suite on the base, then decide whether the chain may continue',
      );
    }
    if (input.postMerge.kind === 'red') {
      const named = input.postMerge.failing.slice(0, 3).join(', ');
      return stop(
        'post-merge-red',
        true,
        `the suite failed on ${short(input.postMerge.sha)}: ${named}`,
        'fix the base before anything else merges; the next unit was not started',
      );
    }
  }

  if (input.merged.length >= input.cap) {
    return stop(
      'cap-reached',
      false,
      `${String(input.merged.length)} unit(s) merged, which is the cap for one run`,
      'read the journal, then start another run if the direction still holds',
    );
  }

  if (input.nextReady <= 0) {
    return stop('nothing-ready', false, 'no unit is ready to take', 'nothing to do; the backlog decides when there is');
  }

  return {
    kind: 'continue',
    detail: `base green after ${String(input.merged.length)} merge(s), ${String(input.nextReady)} unit(s) ready`,
  };
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
