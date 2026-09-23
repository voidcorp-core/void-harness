import { describe, expect, it } from 'vitest';
import type { ReviewVerdict } from './judgments.js';
import {
  generateReviewKey,
  keyFingerprint,
  publicKeyOf,
  renderSignature,
  type SignedVerdict,
  signVerdict,
  verdictDigest,
  verifiedVerdicts,
} from './review-signature.js';

// A worker holds the same GitHub credentials as the reviewer, so a status or a
// comment proves nothing about who wrote it. The verdict is signed instead,
// with a private key that lives in the orchestration checkout only, and read
// with the public key versioned on the base branch: a verdict nobody signed
// with that key is not believed, by the loop or by the required check.

const HEAD = 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63';
const clean: ReviewVerdict = { headSha: HEAD, round: 1, blocking: [], advisory: [] };
const key = generateReviewKey();
const other = generateReviewKey();

const verdict = (extra: Partial<SignedVerdict> = {}): SignedVerdict => ({
  repository: 'voidcorp-core/void-harness',
  ticketId: 'DEV-1',
  pullRequest: 11,
  headSha: HEAD,
  state: 'success',
  verdictDigest: verdictDigest(clean),
  signedAt: '2026-09-23T10:00:00.000Z',
  ...extra,
});

const signed = (fields: SignedVerdict, privateKey = key.privateKey) =>
  renderSignature(signVerdict(privateKey, fields));

describe('the review key', () => {
  it('is an Ed25519 pair whose public half is derived from the private one', () => {
    expect(key.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(key.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    expect(publicKeyOf(key.privateKey)).toBe(key.publicKey);
    expect(keyFingerprint(key.publicKey)).toMatch(/^[0-9a-f]{64}$/);
    expect(keyFingerprint(other.publicKey)).not.toBe(keyFingerprint(key.publicKey));
  });

  it('refuses a key that is not Ed25519', () => {
    expect(() => keyFingerprint('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n')).toThrow(
      /review key/,
    );
  });
});

describe('a signed verdict', () => {
  it('is believed with the public key of the private key that signed it', () => {
    expect(verifiedVerdicts(key.publicKey, [signed(verdict())])).toEqual([verdict()]);
  });

  it('never carries the private key', () => {
    const body = signed(verdict());
    expect(body).not.toContain(key.privateKey.split('\n')[1]);
    expect(body).toContain(keyFingerprint(key.publicKey));
  });

  it('is not believed with another public key, as when the published key was replaced', () => {
    expect(verifiedVerdicts(other.publicKey, [signed(verdict())])).toEqual([]);
  });

  it('is not believed when signed with an unknown key', () => {
    expect(verifiedVerdicts(key.publicKey, [signed(verdict(), other.privateKey)])).toEqual([]);
  });

  it('does not carry over to another head, pull request, outcome, ticket, repository or verdict', () => {
    const genuine = signVerdict(key.privateKey, verdict());
    const replays: Partial<SignedVerdict>[] = [
      { headSha: 'b'.repeat(40) },
      { pullRequest: 12 },
      { state: 'failure' },
      { ticketId: 'DEV-2' },
      { repository: 'someone/else' },
      { verdictDigest: verdictDigest({ ...clean, round: 2 as const }) },
      { signedAt: '2026-09-24T10:00:00.000Z' },
    ];
    for (const replay of replays) {
      const forged = renderSignature({ ...genuine, ...replay });
      expect(verifiedVerdicts(key.publicKey, [forged]), JSON.stringify(replay)).toEqual([]);
    }
  });

  it('is absent from a comment that carries no signature, or a malformed one', () => {
    const malformed = signed(verdict()).replace(/"signature":"[^"]*"/, '"signature":"x"');
    const extra = signed(verdict()).replace('{"', '{"extra":1,"');
    expect(verifiedVerdicts(key.publicKey, ['a comment', malformed, extra, ''])).toEqual([]);
  });

  it('reads every signed verdict across comments, oldest first', () => {
    const later = verdict({ state: 'failure', signedAt: '2026-09-23T11:00:00.000Z' });
    const bodies = [`intro\n${signed(verdict())}`, 'noise', signed(later)];
    expect(verifiedVerdicts(key.publicKey, bodies)).toEqual([verdict(), later]);
  });
});

describe('verdictDigest', () => {
  it('fingerprints the admitted findings, so a signature cannot vouch for edited ones', () => {
    expect(verdictDigest(clean)).toMatch(/^[0-9a-f]{64}$/);
    const finding = { location: 'a.ts:1', scenario: 'It merges unread.', correction: 'Refuse it.' };
    const blocking = { ...clean, blocking: [finding] };
    expect(verdictDigest(blocking)).not.toBe(verdictDigest(clean));
  });
});
