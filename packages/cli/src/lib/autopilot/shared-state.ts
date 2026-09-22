// A fingerprint of the Git state every worker of a repository shares.
//
// A worktree isolates the working tree, the index and HEAD, and nothing else.
// The local config, the stash, tags, notes and remotes are one set for the whole
// repository, so a unit that wrote there changed what every neighbour runs
// against, whatever its own diff looks like (DEV-858). The loop fingerprints
// that set before a unit starts and refuses to publish the unit if it changed.
//
// Digests only, never content: the local config can hold a credential in a
// remote URL, and a record that kept it would carry it to disk. Pure: hashing is
// deterministic and touches nothing; reading git is the adapter's job.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Admission } from './judgments.js';

export const SHARED_STATE_PARTS = ['config', 'stash', 'tags', 'notes', 'remotes'] as const;
export type SharedStatePart = (typeof SHARED_STATE_PARTS)[number];

/** What git printed for each shared part, as the adapter read it. */
export type SharedStateReading = Readonly<Record<SharedStatePart, string>>;

const digest = z.string().regex(/^[0-9a-f]{64}$/, { error: 'must be a sha256 digest' });

const fingerprintSchema = z.strictObject({
  schemaVersion: z.literal(1),
  digests: z.strictObject({
    config: digest,
    stash: digest,
    tags: digest,
    notes: digest,
    remotes: digest,
  }),
});

export type SharedFingerprint = z.infer<typeof fingerprintSchema>;

/**
 * `branch.<name>.*` is what `git push -u` writes for the branch a worker owns.
 * Every unit does it, it touches nobody else's work, and counting it would
 * refuse every unit the loop ever ran. `git config --list` prints section names
 * in lower case, so the prefix is matched as git prints it.
 */
function sharedConfig(config: string): string {
  return config
    .split('\n')
    .filter((line) => !line.startsWith('branch.'))
    .join('\n');
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function fingerprintOf(reading: SharedStateReading): SharedFingerprint {
  return {
    schemaVersion: 1,
    digests: {
      config: sha256(sharedConfig(reading.config)),
      stash: sha256(reading.stash),
      tags: sha256(reading.tags),
      notes: sha256(reading.notes),
      remotes: sha256(reading.remotes),
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
