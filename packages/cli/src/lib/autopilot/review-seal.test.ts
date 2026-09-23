import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  drawNonce,
  publishedSeals,
  renderProof,
  renderSeal,
  sealDigest,
  verdictProof,
  verdictProven,
} from './review-seal.js';

// A worker holds the same credentials as the reviewer, so a status or a comment
// proves nothing about who wrote it. The seal is a secret only the reviewer is
// given: the loop publishes its digest, the verdict carries a proof keyed by
// it, and a verdict whose proof the digest does not answer is not believed.

const HEAD = 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63';
const NONCE = 'a1'.repeat(32);
const binding = { pullRequest: 11, headSha: HEAD, state: 'success' } as const;

describe('drawNonce', () => {
  it('draws thirty-two random bytes, as hex', () => {
    const nonce = drawNonce((size) => new Uint8Array(size).fill(0xab));
    expect(nonce).toBe('ab'.repeat(32));
    expect(drawNonce()).toMatch(/^[0-9a-f]{64}$/);
    expect(drawNonce()).not.toBe(drawNonce());
  });
});

describe('sealDigest', () => {
  it('commits to the nonce without revealing it', () => {
    const digest = sealDigest(NONCE);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(sealDigest(NONCE));
    expect(digest).not.toContain(NONCE);
    expect(sealDigest('b2'.repeat(32))).not.toBe(digest);
  });

  it('refuses a nonce that was not drawn by drawNonce', () => {
    expect(() => sealDigest('short')).toThrow(/nonce/);
    expect(() => verdictProof('A1'.repeat(32), binding)).toThrow(/nonce/);
  });
});

describe('verdictProof', () => {
  it('binds the pull request, the head and the outcome, and reveals neither the nonce nor its digest', () => {
    const proof = verdictProof(NONCE, binding);
    expect(proof).toMatch(/^[0-9a-f]{64}$/);
    expect(proof).not.toContain(NONCE);
    expect(proof).not.toBe(sealDigest(NONCE));
    expect(verdictProof(NONCE, { ...binding, pullRequest: 12 })).not.toBe(proof);
    expect(verdictProof(NONCE, { ...binding, headSha: 'b'.repeat(40) })).not.toBe(proof);
    expect(verdictProof(NONCE, { ...binding, state: 'failure' })).not.toBe(proof);
  });
});

describe('verdictProven', () => {
  const seal = renderSeal(sealDigest(NONCE));
  const verdict = `<!-- void-autopilot:review-verdict -->\n{}\n${renderProof(verdictProof(NONCE, binding))}`;

  it('reads the digests the loop published', () => {
    expect(publishedSeals(['noise', seal, renderSeal('f'.repeat(64))])).toEqual([
      sealDigest(NONCE),
      'f'.repeat(64),
    ]);
  });

  it('believes a proof keyed by the nonce whose digest is published', () => {
    expect(verdictProven(NONCE, { bodies: [seal, verdict], body: verdict, binding })).toBe(true);
  });

  it('believes nothing without the published digest of this nonce', () => {
    expect(verdictProven(NONCE, { bodies: [verdict], body: verdict, binding })).toBe(false);
    // A worker can publish a digest of its own; it answers a nonce the loop never drew.
    const theirs = 'c3'.repeat(32);
    const forged = renderProof(verdictProof(theirs, binding));
    const bodies = [renderSeal(sealDigest(theirs)), forged];
    expect(verdictProven(NONCE, { bodies, body: forged, binding })).toBe(false);
  });

  it('believes no proof made for another head, another outcome, or without the nonce', () => {
    const other = { ...binding, headSha: 'b'.repeat(40) };
    expect(verdictProven(NONCE, { bodies: [seal, verdict], body: verdict, binding: other })).toBe(false);
    const failed = { ...binding, state: 'failure' } as const;
    expect(verdictProven(NONCE, { bodies: [seal, verdict], body: verdict, binding: failed })).toBe(false);
    // The digest is public: a proof keyed by it is what someone without the nonce can make.
    const keyedByDigest = createHmac('sha256', sealDigest(NONCE)).update(HEAD).digest('hex');
    const forged = renderProof(keyedByDigest);
    expect(verdictProven(NONCE, { bodies: [seal, forged], body: forged, binding })).toBe(false);
    expect(verdictProven(NONCE, { bodies: [seal, 'no proof'], body: 'no proof', binding })).toBe(false);
  });
});
