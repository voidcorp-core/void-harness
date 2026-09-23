// The seal of a review: a secret that proves a verdict came from the reviewer.
//
// A worker holds the same GitHub credentials as the reviewer, so neither the
// `void/independent-review` status nor the verdict comment says who wrote it,
// and the hook that refuses a hand-written verdict reads only the commands it
// can parse. The seal does not depend on either. The orchestrator draws a nonce
// when it assigns a ticket, gives it to the reviewer and never to the worker,
// and publishes only its digest on the pull request. `autopilot verdict` signs
// the verdict with it: an HMAC over the pull request, the head and the outcome,
// so the nonce itself is never posted and a proof does not carry over to
// another head. The loop believes a verdict only when that proof answers the
// nonce it drew and whose digest it published.
//
// It protects against a mistake and an injected instruction, not against an
// actor that reads the orchestration checkout from disk with the same rights:
// the nonce is a file there, out of every worktree, and the reviewer runs with
// the same user as everyone else.
//
// Pure but for `drawNonce`'s default source of randomness.
// https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { autopilotFailure } from './errors.js';

const NONCE_BYTES = 32;
const NONCE_PATTERN = /^[0-9a-f]{64}$/;
const SEAL_PATTERN = /<!-- void-autopilot:review-seal ([0-9a-f]{64}) -->/g;
const PROOF_PATTERN = /<!-- void-autopilot:review-proof ([0-9a-f]{64}) -->/;

/** What a proof binds: the verdict on one head of one pull request. */
export interface ProofBinding {
  readonly pullRequest: number;
  readonly headSha: string;
  readonly state: 'success' | 'failure';
}

/** A fresh nonce: thirty-two random bytes, as lower-case hex. */
export function drawNonce(random: (size: number) => Uint8Array = randomBytes): string {
  return Buffer.from(random(NONCE_BYTES)).toString('hex');
}

export function isNonce(text: string): boolean {
  return NONCE_PATTERN.test(text);
}

function nonceKey(nonce: string): Buffer {
  if (isNonce(nonce)) return Buffer.from(nonce, 'hex');
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    'the review nonce is malformed',
    'a nonce is the sixty-four hex characters `autopilot seal` drew',
    'pass the nonce the orchestrator handed to the reviewer, unmodified',
  );
}

/** The public commitment to a nonce, published on the pull request. */
export function sealDigest(nonce: string): string {
  const hash = createHash('sha256').update('void-autopilot:review-seal:');
  return hash.update(nonceKey(nonce)).digest('hex');
}

/** The proof a verdict carries: keyed by the nonce, bound to the pull request, head and outcome. */
export function verdictProof(nonce: string, binding: ProofBinding): string {
  const { pullRequest, headSha, state } = binding;
  const message = `void-autopilot:review-proof:${pullRequest}:${headSha}:${state}`;
  return createHmac('sha256', nonceKey(nonce)).update(message).digest('hex');
}

/** The comment that publishes a seal's digest. */
export function renderSeal(digest: string): string {
  return `<!-- void-autopilot:review-seal ${digest} -->\n`;
}

/** The line a verdict comment ends with. */
export function renderProof(proof: string): string {
  return `<!-- void-autopilot:review-proof ${proof} -->`;
}

/** Every digest published across comment bodies, in order. */
export function publishedSeals(bodies: readonly string[]): string[] {
  return bodies.flatMap((body) =>
    [...body.matchAll(SEAL_PATTERN)].map((match) => match[1] as string),
  );
}

/**
 * Whether the verdict comment `body` carries a proof keyed by `nonce` for this
 * binding, and the digest of that nonce is published among `bodies`. A digest
 * someone else published answers a nonce the loop never drew, so it is only
 * the loop's own that counts.
 */
export function verdictProven(
  nonce: string,
  verdict: {
    readonly bodies: readonly string[];
    readonly body: string;
    readonly binding: ProofBinding;
  },
): boolean {
  if (!publishedSeals(verdict.bodies).includes(sealDigest(nonce))) return false;
  const carried = PROOF_PATTERN.exec(verdict.body)?.[1];
  if (carried === undefined) return false;
  const expected = Buffer.from(verdictProof(nonce, verdict.binding), 'hex');
  return timingSafeEqual(Buffer.from(carried, 'hex'), expected);
}
