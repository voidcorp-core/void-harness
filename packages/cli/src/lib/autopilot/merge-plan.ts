// The one merge a machine may run, as argv, and only when the grant said so.
//
// Publication used to be the last write of a run, and "autopilot publishes; it
// does not merge" was the safety argument. The union-is-read-before-it-merges
// decision moved that line: under `mergeGate: union-reviewed` the grant may
// merge into a branch that does not deploy. Until 2026-09-02 nothing acted on
// it -- the workflow wrote `merged` in its journal on the grant's permission,
// and the chain took the next unit on a base that did not contain the first.
//
// So this is the whole merging surface, kept to one function on purpose:
//
//   - one command, `gh pr merge`, never `--auto` (a merge armed for later is a
//     merge nobody re-read), never `--admin` (bypassing the protection is the
//     opposite of observing it), never `--squash` or `--rebase` (both rewrite
//     the range, and the merge commit is what the chain observes afterwards);
//   - bound to the head the grant read, with `--match-head-commit`, so a push
//     that lands between the reading and the merge makes GitHub refuse rather
//     than merge a tree nobody read (gh 2.97, `gh pr merge --help`);
//   - nothing here is an observation. The command returning is not a merge;
//     `landed` reads the merge commit back, and only that writes `merged`.
//
// Pure. This emits argv; the workflow runs it and re-observes.

import { autopilotFailure } from './errors.js';
import type { PostCheckOutcome } from './union-review.js';

export interface MergeStep {
  readonly kind: 'merge-pull-request';
  readonly command: readonly string[];
  /** What must hold before the step runs, checked by the skill. */
  readonly precondition: string;
}

export interface MergePlan {
  readonly schemaVersion: 1;
  readonly steps: readonly MergeStep[];
}

export interface MergeInput {
  readonly action: PostCheckOutcome;
  /** The pull request as observed, or null when none was read. */
  readonly pullRequest: { readonly number: number } | null | undefined;
  /** The head the grant read; the merge is bound to it. */
  readonly integrationSha: string;
}

const SHA = /^[0-9a-f]{40}$/;

export function buildMergePlan(input: MergeInput): MergePlan {
  if (input.action.action !== 'merge') return { schemaVersion: 1, steps: [] };

  const number = input.pullRequest?.number;
  if (!Number.isInteger(number) || number === undefined || number < 1) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the grant would merge, and no pull request was observed to merge',
      `\`pullRequest.number\` is ${JSON.stringify(number)}`,
      'observe the pull request (`gh pr view --json number,headRefOid`) and pass its number with the grant observation',
    );
  }
  if (!SHA.test(input.integrationSha)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the merge cannot be bound to a head that is not a commit',
      `\`integrationSha\` is ${JSON.stringify(input.integrationSha)}`,
      'resolve the integration branch to a full commit id before asking for the grant',
    );
  }

  return {
    schemaVersion: 1,
    steps: [
      {
        kind: 'merge-pull-request',
        command: ['gh', 'pr', 'merge', String(number), '--merge', '--match-head-commit', input.integrationSha],
        precondition: `pull request #${String(number)} is at ${input.integrationSha} and the grant that named it still holds`,
      },
    ],
  };
}
