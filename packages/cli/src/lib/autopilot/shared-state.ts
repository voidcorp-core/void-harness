// A fingerprint of the Git state every worker of a repository shares.
//
// A worktree isolates the working tree, the index and HEAD, and nothing else.
// The local config (with every file it includes), the stash, tags, notes,
// remotes, the local refs of the base branches, replacement refs, and the hooks
// and info directories of the common Git directory are one set for the whole
// repository. A unit that wrote there changed what every neighbour runs against,
// whatever its own diff looks like (DEV-858). The loop fingerprints that set
// before a unit starts and refuses to publish the unit if it changed.
//
// Digests only, never content: the local config can hold a credential in a
// remote URL, and a record that kept it would carry it to disk. Pure: hashing is
// deterministic and touches nothing; reading git is the adapter's job.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Admission } from './judgments.js';

export const SHARED_STATE_PARTS = [
  'config',
  'stash',
  'tags',
  'notes',
  'remotes',
  'bases',
  'replace',
  'hooks',
  'info',
] as const;
export type SharedStatePart = (typeof SHARED_STATE_PARTS)[number];

/** What git printed for each shared part, as the adapter read it. */
export type SharedStateReading = Readonly<Record<SharedStatePart, string>>;

const digest = z.string().regex(/^[0-9a-f]{64}$/, { error: 'must be a sha256 digest' });

const fingerprintSchema = z.strictObject({
  schemaVersion: z.literal(2),
  /** The ticket's branch, whose upstream settings the digest leaves out. */
  branch: z.string().min(1).max(255),
  digests: z.strictObject({
    config: digest,
    stash: digest,
    tags: digest,
    notes: digest,
    remotes: digest,
    bases: digest,
    replace: digest,
    hooks: digest,
    info: digest,
  }),
});

export type SharedFingerprint = z.infer<typeof fingerprintSchema>;

/**
 * `branch.<name>.remote` and `.merge` are what `git push -u` writes for the
 * branch a worker owns, and counting them would refuse every unit the loop ever
 * ran. Only those two, and only for the ticket's own branch: the same keys on
 * the base make its next pull merge the worker's branch, and any other branch
 * setting changes what a neighbour's command does. `git config --list` prints
 * the section and the key in lower case and the branch name as written.
 */
function sharedConfig(config: string, branch: string): string {
  const own = [`branch.${branch}.remote=`, `branch.${branch}.merge=`];
  return config
    .split('\n')
    .filter((line) => !own.some((prefix) => line.startsWith(prefix)))
    .join('\n');
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The digests of a reading, leaving out the upstream of `branch`, the ticket's own. */
export function fingerprintOf(reading: SharedStateReading, branch: string): SharedFingerprint {
  return {
    schemaVersion: 2,
    branch,
    digests: {
      config: sha256(sharedConfig(reading.config, branch)),
      stash: sha256(reading.stash),
      tags: sha256(reading.tags),
      notes: sha256(reading.notes),
      remotes: sha256(reading.remotes),
      bases: sha256(reading.bases),
      replace: sha256(reading.replace),
      hooks: sha256(reading.hooks),
      info: sha256(reading.info),
    },
  };
}

/** The parts whose digest differs, in declaration order; empty means untouched. */
export function changedParts(
  before: SharedFingerprint,
  after: SharedFingerprint,
): SharedStatePart[] {
  return SHARED_STATE_PARTS.filter((part) => before.digests[part] !== after.digests[part]);
}

/** A fingerprint read back from its record: exactly the digests, nothing else. */
export function admitFingerprint(value: unknown): Admission<SharedFingerprint> {
  const parsed = fingerprintSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return { ok: false, reason: `shared state fingerprint refused: ${issues.join('; ')}` };
}
