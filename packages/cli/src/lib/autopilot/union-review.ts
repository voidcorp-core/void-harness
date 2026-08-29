// Whether an integrated cluster may merge itself, and what it costs to say no.
//
// The principle this serves is unchanged: no union merges without being read.
// Only the reader changed. A human reads it where production is the next step;
// an adversarial fresh-context pass over the whole integrated diff reads it
// everywhere else. See the union-is-read-before-it-merges decision.
//
// Pure. This judges an observation; it merges nothing, spawns nothing, and asks
// no runtime for anything. The caller runs the reading and hands back what it
// returned.
//
// The failure mode being designed against is not a reader that finds nothing. It
// is a reader that never ran, could not finish, or answered about a different
// tree, and whose silence gets read as approval. All three refuse here, and they
// refuse with the same words a human would need to unblock them.

/** A contradiction between workers that no single worker could have seen. */
export interface Contradiction {
  readonly summary: string;
  /** Concrete anchors, so the finding can be checked rather than believed. */
  readonly evidence: readonly string[];
}

/**
 * `clean` means the reader tried to refute the union and failed to.
 * `contradicted` means it succeeded. `inconclusive` means it could not finish,
 * which clears nothing.
 */
export type UnionVerdict = 'clean' | 'contradicted' | 'inconclusive';

export interface UnionReview {
  readonly schemaVersion: 1;
  /** The tree this verdict is about. A verdict about another tree is not one. */
  readonly integrationSha: string;
  readonly verdict: UnionVerdict;
  readonly contradictions: readonly Contradiction[];
}

export interface MergeGrantInput {
  /** Branch this pull request would merge into. */
  readonly target: string;
  /** The branch that deploys. Never assumed to be called `main`. */
  readonly deployBranch: string;
  /** Head of the integration branch as it stands now. */
  readonly integrationSha: string;
  /** What the union reader returned, or undefined if none ran. */
  readonly review: UnionReview | undefined;
}

export type MergeRefusal =
  | 'production-downstream'
  | 'union-unread'
  | 'union-contradicted'
  | 'review-stale';

export type MergeGrant =
  | { readonly kind: 'granted' }
  | {
      readonly kind: 'refused';
      readonly reason: MergeRefusal;
      readonly detail: string;
      readonly fix: string;
    };

function refused(reason: MergeRefusal, detail: string, fix: string): MergeGrant {
  return { kind: 'refused', reason, detail, fix };
}

const short = (sha: string): string => sha.slice(0, 7);

export function judgeMergeGrant(input: MergeGrantInput): MergeGrant {
  // Production first, and deliberately before every other check. When the target
  // deploys and the reading is also stale, reporting the stale reading would send
  // someone to run a pass that cannot unlock anything.
  if (input.target === input.deployBranch) {
    return refused(
      'production-downstream',
      `merging into \`${input.target}\` ships, and what a person judges there is the feature`,
      'merge it yourself once you have seen the integration branch behave',
    );
  }

  const review = input.review;
  if (review === undefined) {
    return refused(
      'union-unread',
      'no union review ran, and an unread union is not a clean one',
      'run the union review over the integrated diff, then ask again',
    );
  }
  if (review.verdict === 'inconclusive') {
    return refused(
      'union-unread',
      'the union review could not finish, which clears nothing',
      'run the union review again; a reading that stopped early is not a verdict',
    );
  }
  // Before the verdict is trusted, check it is about this tree. A range added, a
  // conflict resolved, or a CI correction pushed after the reading moves the
  // head, and a clean verdict then describes bytes that are no longer here.
  if (review.integrationSha !== input.integrationSha) {
    return refused(
      'review-stale',
      `the union review is about ${short(review.integrationSha)}, and the branch is now at ${short(input.integrationSha)}`,
      'run the union review against the current head',
    );
  }
  if (review.verdict === 'contradicted') {
    const first = review.contradictions[0];
    const named = first === undefined
      ? 'the union review refuted the integrated diff'
      : `the union review found: ${first.summary}`;
    const more = review.contradictions.length > 1
      ? ` (and ${String(review.contradictions.length - 1)} more)`
      : '';
    return refused(
      'union-contradicted',
      `${named}${more}`,
      'fix what the review named, then read the union again against the new head',
    );
  }
  return { kind: 'granted' };
}
