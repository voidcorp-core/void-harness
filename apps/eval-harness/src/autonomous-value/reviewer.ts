import type { HeadToHeadInput } from '../types.js';

const MAX_REVIEW_TEXT = 64 * 1024;
const MAX_REVIEW_CRITERIA = 32;
const MAX_REVIEW_CRITERION_LENGTH = 512;
const SECRET = /((?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*)[^\s&,;]+/gi;
const MODE = /\b(?:agent-alone|autopilot|implement|brainstorm)\b/gi;

export type BlindOrder = 'A-first' | 'B-first';

export interface BlindReviewArtifact {
  readonly content: string;
}

export interface BlindReviewRequest {
  readonly reviewIndex: number;
  readonly left: BlindReviewArtifact;
  readonly right: BlindReviewArtifact;
  readonly criteria: readonly string[];
  readonly reviewerContext: string;
}

export interface BlindReviewJudgeVerdict {
  readonly winner: 'A' | 'B' | 'tie';
  readonly reason: string;
}

/** Port for a judge. Its unknown result is validated before it becomes evidence. */
export type BlindReviewJudge = (input: HeadToHeadInput) => Promise<unknown>;

export type BlindReviewResult =
  | {
      readonly kind: 'reviewed';
      readonly order: BlindOrder;
      readonly winner: 'A' | 'B' | 'tie';
      readonly reason: string;
      readonly reviewerContext: string;
    }
  | { readonly kind: 'unknown'; readonly reason: string };

function blindSafeText(value: string): string {
  return value
    .replace(SECRET, '$1[REDACTED]')
    .replace(MODE, '[CONDITION]')
    .replace(/[\0\r\n]/g, ' ')
    .slice(0, MAX_REVIEW_TEXT);
}

function validRequest(request: BlindReviewRequest): boolean {
  return Number.isInteger(request.reviewIndex)
    && request.reviewIndex >= 0
    && request.reviewerContext.length > 0
    && request.reviewerContext.length <= 256
    && !/[\0\r\n]/.test(request.reviewerContext)
    && request.criteria.length > 0
    && request.criteria.length <= MAX_REVIEW_CRITERIA
    && request.criteria.every((criterion) =>
      criterion.trim() !== ''
      && criterion.length <= MAX_REVIEW_CRITERION_LENGTH
      && !/[\0\r\n]/.test(criterion))
    && request.left.content.length > 0
    && request.left.content.length <= MAX_REVIEW_TEXT
    && request.right.content.length > 0
    && request.right.content.length <= MAX_REVIEW_TEXT;
}

export function blindOrder(reviewIndex: number): BlindOrder {
  if (!Number.isInteger(reviewIndex) || reviewIndex < 0) {
    throw new RangeError('review index must be a non-negative integer');
  }
  return reviewIndex % 2 === 0 ? 'A-first' : 'B-first';
}

/** Build exactly the unlabelled A/B payload sent to the blind reviewer. */
export function buildBlindReviewInput(request: BlindReviewRequest): HeadToHeadInput {
  const order = blindOrder(request.reviewIndex);
  return {
    a: order === 'A-first' ? blindSafeText(request.left.content) : blindSafeText(request.right.content),
    b: order === 'A-first' ? blindSafeText(request.right.content) : blindSafeText(request.left.content),
    criteria: [...request.criteria],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value instanceof Object && !Array.isArray(value);
}

function parseVerdict(value: unknown): BlindReviewJudgeVerdict | undefined {
  if (!isRecord(value)) return undefined;
  const winner = value['winner'];
  const reason = value['reason'];
  if ((winner !== 'A' && winner !== 'B' && winner !== 'tie')
    || typeof reason !== 'string'
    || reason.trim() === ''
    || reason.length > 512
    || /[\0\r\n]/.test(reason)) return undefined;
  return { winner, reason: reason.trim() };
}

/** Execute a blind comparison while keeping reviewer context out of the judge payload. */
export async function runBlindReview(
  request: BlindReviewRequest,
  judge: BlindReviewJudge,
): Promise<BlindReviewResult> {
  if (request.reviewerContext.trim() === '') return { kind: 'unknown', reason: 'reviewer context is missing' };
  if (!validRequest(request)) {
    return { kind: 'unknown', reason: 'blind review input is incomplete' };
  }
  const order = blindOrder(request.reviewIndex);
  try {
    const verdict = parseVerdict(await judge(buildBlindReviewInput(request)));
    return verdict === undefined
      ? { kind: 'unknown', reason: 'blind review returned an invalid verdict' }
      : { kind: 'reviewed', order, ...verdict, reviewerContext: request.reviewerContext };
  } catch {
    return { kind: 'unknown', reason: 'blind review failed' };
  }
}
