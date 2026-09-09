// Proving that a worker's commit range is what the worker said it is.
//
// This is the load-bearing check of reconciliation, and it exists because a
// clean `git merge` exit code proves nothing about WHAT was merged. A worker
// that branched from the wrong commit, absorbed a merge, or picked up history
// from another branch produces a merge that succeeds and a PR that quietly
// contains work nobody reviewed.
//
// So the range is verified against the observed parent links, not against the
// command's exit status: the commits form one line of history from the declared
// base, none has two parents, it ends at the declared head, and the set is
// exactly what the worker declared — no more, no less.
//
// The parent links are the evidence, and the order the observation arrived in is
// not. It used to be: the walk started at the first entry, so it demanded
// oldest-first while the observation the skill prescribes — `git log` — prints
// newest-first. Every range of more than one commit was refused, which
// destroyed exactly the tickets that split a test commit from its
// implementation, and the refusal named a parent mismatch that reads like a
// corrupted rebase. A convention only one of the two sides knows is the defect
// itself, so the set is now read back into its own order.
//
// Pure. The skill runs `git log --format='%H %P' base..head`; this decides.

export interface ObservedCommit {
  readonly sha: string;
  /** Parent shas as git reported them. Two or more means a merge. */
  readonly parents: readonly string[];
}

export interface RangeObservation {
  readonly ticketId: string;
  readonly baseSha: string;
  readonly headSha: string;
  /** Commits of `base..head`, in any order: the parent links carry the order. */
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
  /** `commits` is the range read back into its own order, oldest first. */
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

  // Read the set back into its own order, from the base forward. Every commit
  // has one parent here — the merge check above is what makes that true — so
  // one line of history is one commit per parent, and the walk that follows
  // them cannot be longer than the set it walks.
  const reported = observation.commits.map((commit) => commit.sha);
  if (new Set(reported).size !== reported.length) {
    return reject(
      'broken-chain',
      `\`${ticketId}\` reports the same commit twice, and a range holds each of its commits once`,
    );
  }

  const childOf = new Map<string, string>();
  for (const commit of observation.commits) {
    const parent = commit.parents[0] ?? '';
    const sibling = childOf.get(parent);
    if (sibling !== undefined) {
      return reject(
        'broken-chain',
        `\`${ticketId}\` puts ${commit.sha} and ${sibling} on the same parent ${parent}, which is two lines of history rather than one range`,
      );
    }
    childOf.set(parent, commit.sha);
  }

  if (!childOf.has(observation.baseSha)) {
    return reject(
      'not-descended-from-base',
      `\`${ticketId}\` holds no commit whose parent is the declared base ${observation.baseSha}; the commits may arrive in any order, but one of them starts at the base`,
    );
  }

  const observed: string[] = [];
  let last = observation.baseSha;
  for (let hop = 0; hop < observation.commits.length; hop += 1) {
    const next = childOf.get(last);
    if (next === undefined) break;
    observed.push(next);
    last = next;
  }

  if (observed.length !== observation.commits.length) {
    const reached = new Set(observed);
    const stranded = reported.filter((sha) => !reached.has(sha));
    return reject(
      'broken-chain',
      `\`${ticketId}\` carries ${stranded.join(', ')}, which no parent link joins to the base ${observation.baseSha}; the range is read as a set, so the order it was reported in is not what is missing`,
    );
  }

  if (last !== observation.headSha) {
    return reject(
      'head-mismatch',
      `\`${ticketId}\` declares head ${observation.headSha} while its range ends at ${last}`,
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
