// Proving that a worker's commit range is what the worker said it is.
//
// This is the load-bearing check of reconciliation, and it exists because a
// clean `git merge` exit code proves nothing about WHAT was merged. A worker
// that branched from the wrong commit, absorbed a merge, or picked up history
// from another branch produces a merge that succeeds and a PR that quietly
// contains work nobody reviewed.
//
// So the range is verified against the observed parent links, not against the
// command's exit status: every commit descends from the previous one, the first
// descends from the declared base, none has two parents, and the set is exactly
// what the worker declared — no more, no less.
//
// Pure. The skill runs `git rev-list --parents`; this decides.

export interface ObservedCommit {
  readonly sha: string;
  /** Parent shas as git reported them. Two or more means a merge. */
  readonly parents: readonly string[];
}

export interface RangeObservation {
  readonly ticketId: string;
  readonly baseSha: string;
  readonly headSha: string;
  /** Commits of `base..head`, oldest first. */
  readonly commits: readonly ObservedCommit[];
  /**
   * Files `git diff --name-only base..head` reported, when it was run.
   *
   * Not read by `verifyRange`, which judges ancestry: it travels with the
   * observation because it is the same sighting of the same range, and the
   * footprint audit downstream refuses to accept the worker's own list in its
   * place.
   */
  readonly observedFiles?: readonly string[];
}

export interface RangeExpectation {
  /** Commits the worker claimed, in order. */
  readonly declaredCommits: readonly string[];
  /** Upper bound on a single ticket's range. Default 200. */
  readonly maxCommits?: number;
}

export type RangeRejection =
  | 'malformed-observation'
  | 'empty-range'
  | 'range-too-large'
  | 'not-descended-from-base'
  | 'contains-merge'
  | 'broken-chain'
  | 'foreign-commit'
  | 'missing-commit'
  | 'head-mismatch';

export type RangeVerdict =
  | { readonly kind: 'usable'; readonly commits: readonly string[] }
  | {
      readonly kind: 'rejected';
      readonly ticketId: string;
      readonly reason: RangeRejection;
      readonly detail: string;
    };

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const DEFAULT_MAX_COMMITS = 200;

export function verifyRange(observation: RangeObservation, expectation: RangeExpectation): RangeVerdict {
  const ticketId = observation.ticketId;
  const reject = (reason: RangeRejection, detail: string): RangeVerdict => ({
    kind: 'rejected',
    ticketId,
    reason,
    detail,
  });

  const wellFormed =
    COMMIT_SHA.test(observation.baseSha) &&
    COMMIT_SHA.test(observation.headSha) &&
    Array.isArray(observation.commits) &&
    observation.commits.every((commit) => {
      const parents: readonly unknown[] = commit?.parents ?? [];
      return (
        COMMIT_SHA.test(commit?.sha) &&
        Array.isArray(parents) &&
        parents.every((parent) => typeof parent === 'string' && COMMIT_SHA.test(parent))
      );
    });
  if (!wellFormed) {
    return reject('malformed-observation', 'the git observation contains a value that is not a full commit id');
  }

  if (observation.commits.length === 0 || observation.baseSha === observation.headSha) {
    return reject('empty-range', `\`${ticketId}\` has no commit between its base and its head`);
  }

  const maxCommits = expectation.maxCommits ?? DEFAULT_MAX_COMMITS;
  if (observation.commits.length > maxCommits) {
    return reject(
      'range-too-large',
      `\`${ticketId}\` reports ${observation.commits.length} commits, above the bound of ${maxCommits}`,
    );
  }

  // Merges are looked for across the WHOLE set before the chain is walked.
  // On a real history a merge also breaks the chain — `rev-list` lists both
  // sides of it — so a chain-first walk reports "broken chain" and buries the
  // fact that matters: history nobody validated came along for the ride.
  const merge = observation.commits.find((commit) => commit.parents.length > 1);
  if (merge !== undefined) {
    return reject(
      'contains-merge',
      `\`${ticketId}\` includes merge commit ${merge.sha}; a worker range is linear or it is not integrable`,
    );
  }

  // Walk the chain. Each commit must have exactly one parent, and that parent
  // must be the previous commit — the base for the first.
  let expectedParent = observation.baseSha;
  for (const commit of observation.commits) {
    const parent = commit.parents[0];
    if (parent !== expectedParent) {
      // Two different failures look identical at the first commit. If some
      // OTHER commit of the set does descend from the base, the set is a chain
      // reported in the wrong order; if none does, the worker branched
      // elsewhere entirely. The distinction is what makes the message useful.
      const rootedElsewhere =
        commit === observation.commits[0] &&
        !observation.commits.some((other) => other.parents[0] === observation.baseSha);

      return rootedElsewhere
        ? reject(
            'not-descended-from-base',
            `\`${ticketId}\` starts at ${commit.sha}, whose parent is ${parent ?? 'none'} rather than the declared base ${observation.baseSha}`,
          )
        : reject(
            'broken-chain',
            `\`${ticketId}\` reports ${commit.sha} after ${expectedParent}, but its parent is ${parent ?? 'none'}`,
          );
    }
    expectedParent = commit.sha;
  }

  const observed = observation.commits.map((commit) => commit.sha);
  if (expectedParent !== observation.headSha) {
    return reject(
      'head-mismatch',
      `\`${ticketId}\` declares head ${observation.headSha} while its range ends at ${expectedParent}`,
    );
  }

  const declared = new Set(expectation.declaredCommits);
  const foreign = observed.filter((sha) => !declared.has(sha));
  if (foreign.length > 0) {
    return reject(
      'foreign-commit',
      `\`${ticketId}\` carries ${foreign.join(', ')}, which the worker never declared`,
    );
  }

  const seen = new Set(observed);
  const missing = expectation.declaredCommits.filter((sha) => !seen.has(sha));
  if (missing.length > 0) {
    return reject(
      'missing-commit',
      `\`${ticketId}\` declared ${missing.join(', ')}, which git cannot find in its range`,
    );
  }

  return { kind: 'usable', commits: observed };
}
