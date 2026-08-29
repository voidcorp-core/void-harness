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

import { autopilotFailure } from './errors.js';

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


const MAX_CONTRADICTIONS = 50;
const MAX_EVIDENCE = 20;
const MAX_TEXT = 2000;
const VERDICTS: readonly UnionVerdict[] = ['clean', 'contradicted', 'inconclusive'];

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

export interface UnionReviewRequest {
  readonly schemaVersion: 1;
  readonly integrationBranch: string;
  readonly integrationSha: string;
  /** argv producing the whole integrated diff, base to head. */
  readonly diffCommand: readonly string[];
  readonly instruction: string;
  readonly ticketIds: readonly string[];
}

export interface UnionReviewRequestInput {
  readonly integrationBranch: string;
  readonly integrationSha: string;
  readonly baseSha: string;
  readonly ticketIds: readonly string[];
}

/**
 * What the union reader is asked, and over what.
 *
 * The diff spans base to head rather than any single worker range: the defect
 * this pass exists for is two workers each locally correct and disagreeing with
 * each other, which no range contains.
 *
 * The instruction says refute. A pass told to check for problems reports none
 * and means nothing by it; a pass told to break the union and failing has made a
 * claim that can be wrong, which is what makes a clean verdict worth having.
 */
export function buildUnionReviewRequest(input: UnionReviewRequestInput): UnionReviewRequest {
  return {
    schemaVersion: 1,
    integrationBranch: input.integrationBranch,
    integrationSha: input.integrationSha,
    diffCommand: ['git', 'diff', `${input.baseSha}..${input.integrationSha}`],
    instruction: [
      'Read the whole integrated diff and try to REFUTE it. You are not checking',
      'for problems: you are trying to break the union, and reporting only what',
      'survived. Each worker was correct in isolation and each range already',
      'passed its own gates, so per-file review adds nothing here.',
      'Look for what only the union shows: the same concept named twice, two',
      'modules that disagree about a word, an assertion in one range that another',
      'range falsifies, a proof that does not prove what it claims.',
      'Report a contradiction only with a concrete anchor a reader can open.',
      'Finding nothing means you failed to refute it, which is the verdict; it',
      'does not mean the diff is good.',
    ].join(' '),
    ticketIds: [...input.ticketIds],
  };
}

function parseContradictions(value: unknown): readonly Contradiction[] {
  if (!Array.isArray(value) || value.length > MAX_CONTRADICTIONS) {
    invalid(
      'the union review has an unusable contradiction list',
      `\`contradictions\` must be an array of at most ${MAX_CONTRADICTIONS} entries`,
      'report each contradiction as one entry with a summary and its anchors',
    );
  }
  return value.map((entry) => {
    const found = entry as Partial<Contradiction>;
    const summary = found?.summary;
    if (typeof summary !== 'string' || summary.trim().length === 0 || summary.length > MAX_TEXT) {
      invalid(
        'a union contradiction does not say what it found',
        '`summary` must be a non-empty string',
        'state each contradiction as one bounded sentence',
      );
    }
    const evidence = found?.evidence;
    // A finding with no anchor cannot be checked or fixed, and would block the
    // merge on an assertion nobody can act on. Refused rather than downgraded.
    if (
      !Array.isArray(evidence)
      || evidence.length === 0
      || evidence.length > MAX_EVIDENCE
      || evidence.some((item) => typeof item !== 'string' || item.trim().length === 0)
    ) {
      invalid(
        'a union contradiction names nowhere to look',
        `\`evidence\` must hold 1 to ${MAX_EVIDENCE} non-empty anchors`,
        'give each contradiction at least one file, path or identifier a reader can open',
      );
    }
    return { summary, evidence: [...evidence] as readonly string[] };
  });
}

/**
 * The boundary where the reader's prose stops.
 *
 * `observedSha` is the tree the CALLER took the diff from. The reader never
 * supplies it: it is the one field that could turn a stale verdict into a
 * fresh-looking one, so a claimed value is ignored rather than trusted.
 *
 * Unparsable output throws. Defaulting to `clean` would make every malformed
 * answer an approval, which is the failure this whole pass exists to prevent.
 */
export function parseUnionReview(raw: unknown, observedSha: string): UnionReview {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    invalid(
      'the union review is not an object',
      'the reader returned something that is not a JSON object',
      'have the reader return { verdict, contradictions }',
    );
  }
  const body = raw as { readonly verdict?: unknown; readonly contradictions?: unknown };
  const verdict = body.verdict;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as UnionVerdict)) {
    invalid(
      'the union review does not carry a usable verdict',
      `\`verdict\` must be one of ${VERDICTS.join(', ')}`,
      'have the reader answer clean, contradicted or inconclusive',
    );
  }
  return {
    schemaVersion: 1,
    integrationSha: observedSha,
    verdict: verdict as UnionVerdict,
    contradictions: parseContradictions(body.contradictions),
  };
}

/**
 * The verdict of a reading that never returned -- a timeout, an adapter failure,
 * an interrupted run. Not clean and not contradicted: it cleared nothing, and it
 * says so rather than falling back to a default someone would read as approval.
 */
export function inconclusiveReview(observedSha: string): UnionReview {
  return { schemaVersion: 1, integrationSha: observedSha, verdict: 'inconclusive', contradictions: [] };
}


/** Where the checks stand, as `planCheckResponse` reports it. */
export type CheckStand = 'ready' | 'fix' | 'escalate' | 'wait';

export type PostCheckAction = 'merge' | 'await-human' | 'hold';

export interface PostCheckOutcome {
  readonly action: PostCheckAction;
  readonly detail: string;
}

/**
 * What happens to a published integration branch once its checks have spoken.
 *
 * Two questions that must not collapse into one. Where the checks stand is not
 * whether this union may merge itself, and deciding the second while the first
 * is unsettled would decide it on evidence that does not exist yet -- so
 * anything but `ready` holds, whatever the grant says.
 */
export function planPostCheckAction(input: {
  readonly checks: CheckStand;
  readonly grant: MergeGrant;
}): PostCheckOutcome {
  if (input.checks !== 'ready') {
    return { action: 'hold', detail: 'the checks have not settled; nothing to decide yet' };
  }
  if (input.grant.kind === 'granted') {
    return { action: 'merge', detail: 'checks are green and the union came back clean' };
  }
  // The reason travels with the hand-off. A branch left to a person without one
  // makes them re-derive what the run already knew.
  return { action: 'await-human', detail: input.grant.detail };
}
