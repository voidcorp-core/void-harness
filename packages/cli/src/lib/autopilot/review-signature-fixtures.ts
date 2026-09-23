// tdd-cover: e2e packages/cli/src/lib/autopilot/loop-observe.test.ts
// A review key and verdict comments signed with it, as `autopilot verdict` posts them.
import { renderJudgmentComment } from './judgment-comment.js';
import { admitReviewVerdict } from './judgments.js';
import {
  generateReviewKey,
  renderSignature,
  type SignedVerdict,
  signVerdict,
  verdictDigest,
} from './review-signature.js';

/** Drawn once per test run: Ed25519 keys are cheap, but nothing gains from drawing more. */
export const TEST_REVIEW_KEY = generateReviewKey();
export const TEST_REPOSITORY = 'voidcorp-core/void-harness';
export const TEST_SIGNED_AT = '2026-09-22T12:00:00.000Z';

export interface SignedCommentOptions {
  readonly pullRequest: number;
  readonly ticketId: string;
  /** The outcome signed; the one the findings imply unless given. */
  readonly state?: SignedVerdict['state'];
  readonly signedAt?: string;
  readonly repository?: string;
  readonly privateKey?: string;
}

/**
 * The comment `autopilot verdict` posts: the verdict block, then its signature.
 * A verdict the command would refuse is posted raw and unsigned, as only a
 * hand could post it, so a test can show what the kernel makes of one.
 */
export function signedVerdictComment(verdict: unknown, options: SignedCommentOptions): string {
  const admission = admitReviewVerdict(verdict);
  if (!admission.ok) {
    const raw = JSON.stringify(verdict);
    return `<!-- void-autopilot:review-verdict -->\n\`\`\`json\n${raw}\n\`\`\`\n<!-- /void-autopilot:review-verdict -->\n`;
  }
  const admitted = admission.value;
  const signature = signVerdict(options.privateKey ?? TEST_REVIEW_KEY.privateKey, {
    repository: options.repository ?? TEST_REPOSITORY,
    ticketId: options.ticketId,
    pullRequest: options.pullRequest,
    headSha: admitted.headSha,
    state: options.state ?? (admitted.blocking.length === 0 ? 'success' : 'failure'),
    verdictDigest: verdictDigest(admitted),
    signedAt: options.signedAt ?? TEST_SIGNED_AT,
  });
  return `${renderJudgmentComment('review-verdict', admitted)}${renderSignature(signature)}\n`;
}
