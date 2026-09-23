// The signature of a review verdict: what only the reviewer's key can produce.
//
// A worker holds the same GitHub credentials as the reviewer, so neither the
// `void/independent-review` status nor the verdict comment says who wrote it,
// and the hook that refuses a hand-written verdict reads only the commands it
// can parse. The signature depends on neither. `autopilot review-key` draws an
// Ed25519 pair once: the private half stays in the orchestration checkout, out
// of every worktree, and the public half is versioned on the base branch as
// `.github/void-review.pub`, where only a merge changes it. `autopilot verdict`
// signs the repository, ticket, pull request, head, outcome, a digest of the
// findings and the time; the loop and the required `independent-review` job
// both verify it with the public key, so a verdict nobody signed with that key
// passes neither, whether or not the hook read the command that posted it.
//
// It protects against a worker and an injected instruction, not against an
// actor that reads the orchestration checkout from disk with the same rights:
// the private key is a file there, mode 0600, owned by the user every agent
// runs as.
//
// `scripts/independent-review-check.mjs` verifies the same format on its own,
// from the base branch; a contract test signs here and verifies there.
// https://nodejs.org/api/crypto.html#cryptosignalgorithm-data-key-callback
// https://nodejs.org/api/crypto.html#cryptogeneratekeypairsynctype-options

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
  verify,
} from 'node:crypto';
import { z } from 'zod';
import { autopilotFailure } from './errors.js';
import type { ReviewVerdict } from './judgments.js';

/** Where the public key lives, versioned, read by the required check from the base branch. */
export const REVIEW_PUBLIC_KEY_PATH = '.github/void-review.pub';

const SIGNATURE_PATTERN = /<!-- void-autopilot:review-signature (\{[^\n]*?\}) -->/g;
const HEX64 = /^[0-9a-f]{64}$/;

const signedVerdictSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  ticketId: z.string().regex(/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/),
  pullRequest: z.int().positive().max(2_147_483_647),
  headSha: z.string().regex(/^[0-9a-f]{40}$/),
  state: z.enum(['success', 'failure']),
  verdictDigest: z.string().regex(HEX64),
  signedAt: z.iso.datetime(),
});
export type SignedVerdict = z.infer<typeof signedVerdictSchema>;

const signatureSchema = signedVerdictSchema.extend({
  key: z.string().regex(HEX64),
  signature: z.base64().length(88),
});
export type VerdictSignature = z.infer<typeof signatureSchema>;

export interface ReviewKeyPair {
  /** PKCS#8 PEM; it never leaves the orchestration checkout. */
  readonly privateKey: string;
  /** SPKI PEM, versioned at `REVIEW_PUBLIC_KEY_PATH`. */
  readonly publicKey: string;
}

export function generateReviewKey(): ReviewKeyPair {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function reviewKey(read: () => KeyObject): KeyObject {
  let key: KeyObject;
  try {
    key = read();
  } catch {
    return notEd25519();
  }
  return key.asymmetricKeyType === 'ed25519' ? key : notEd25519();
}

function notEd25519(): never {
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    'the review key is unreadable',
    'a review key is an Ed25519 key in PEM, as `autopilot review-key` writes it',
    'restore the key `autopilot review-key` drew; never edit it by hand',
  );
}

/** The public half of a private review key, as SPKI PEM. */
export function publicKeyOf(privateKey: string): string {
  const key = reviewKey(() => createPublicKey(createPrivateKey(privateKey)));
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

/** SHA-256 of the key's DER encoding: names a key without carrying it. */
export function keyFingerprint(publicKey: string): string {
  const key = reviewKey(() => createPublicKey(publicKey));
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

/** The findings a signature vouches for, as the admitted verdict serialises. */
export function verdictDigest(verdict: ReviewVerdict): string {
  return createHash('sha256').update(JSON.stringify(verdict)).digest('hex');
}

/** What is signed: one field per line, in a fixed order, under a versioned header. */
export function signatureMessage(fields: SignedVerdict): string {
  return [
    'void-autopilot:review-verdict:v1',
    `repository=${fields.repository}`,
    `ticket=${fields.ticketId}`,
    `pullRequest=${fields.pullRequest}`,
    `headSha=${fields.headSha}`,
    `state=${fields.state}`,
    `verdict=${fields.verdictDigest}`,
    `signedAt=${fields.signedAt}`,
  ].join('\n');
}

export function signVerdict(privateKey: string, fields: SignedVerdict): VerdictSignature {
  const key = reviewKey(() => createPrivateKey(privateKey));
  const signature = sign(null, Buffer.from(signatureMessage(fields), 'utf8'), key);
  return {
    ...signedVerdictSchema.parse(fields),
    key: keyFingerprint(publicKeyOf(privateKey)),
    signature: signature.toString('base64'),
  };
}

/** The line a verdict comment ends with. */
export function renderSignature(signature: VerdictSignature): string {
  return `<!-- void-autopilot:review-signature ${JSON.stringify(signature)} -->`;
}

/**
 * Every verdict across comment bodies, oldest first, whose signature the public
 * key verifies. A malformed marker, one signed by another key and one whose
 * fields were edited after signing are all left out: they vouch for nothing.
 */
export function verifiedVerdicts(publicKey: string, bodies: readonly string[]): SignedVerdict[] {
  const key = reviewKey(() => createPublicKey(publicKey));
  return bodies.flatMap((body) =>
    [...body.matchAll(SIGNATURE_PATTERN)].flatMap((match) => {
      let value: unknown;
      try {
        value = JSON.parse(match[1] ?? '');
      } catch {
        return [];
      }
      const parsed = signatureSchema.safeParse(value);
      if (!parsed.success) return [];
      const { key: _fingerprint, signature, ...fields } = parsed.data;
      const message = Buffer.from(signatureMessage(fields), 'utf8');
      return verify(null, message, key, Buffer.from(signature, 'base64')) ? [fields] : [];
    }),
  );
}
