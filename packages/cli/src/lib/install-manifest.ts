// What THIS PROJECT expects its harness assets to be, byte for byte.
//
// The receipt (`.void/machine/receipts/install-v1.json`) records what THIS MACHINE
// installed and is `observed`: machine-local, never shipped. The manifest is its
// mirror image and is `project`: authored by an install, committed, and read by
// every other checkout. Same shape, opposite lifecycles — the axis the layout
// split established, applied one level up.
//
// It exists because `.void/config.json` cannot answer "which bytes". `core` is a
// caret RANGE, and `init` materializes whatever assets the running CLI carries,
// so two checkouts of the same commit can legitimately hold different content
// with nothing reporting it. An exact version plus per-file hashes is what turns
// "re-materialized" into "restored, and proven".
//
// Pure except `verifyInstallManifest`, which reads the files it checks.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCoOwned } from './co-owned.js';
import { isSafeRelativePath } from './transaction.js';

/** Committed, `project` class — deliberately NOT under `.void/machine/`. */
export const INSTALL_MANIFEST_PATH = '.void/install-manifest.json';

/** How many drifting paths a report names before it just counts them. */
const MAX_REPORTED = 20;

export interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
}

export interface InstallManifest {
  readonly schemaVersion: 1;
  /** An exact version. A range here would defeat the entire point. */
  readonly version: string;
  readonly files: readonly ManifestFile[];
}

export interface ManifestVerification {
  readonly ok: boolean;
  readonly verified: number;
  /** Paths the restore did not produce, capped for readability. */
  readonly missing: readonly string[];
  readonly missingTotal: number;
  /** Paths present with different bytes, capped for readability. */
  readonly mismatched: readonly string[];
  readonly mismatchedTotal: number;
  /**
   * Co-owned paths whose bytes differ, capped for readability. Reported apart
   * from `mismatched` and excluded from `ok`: the project is invited to write
   * into these, so a difference is the file being used, not an asset diverging
   * from the version it claims.
   */
  readonly coEdited: readonly string[];
  readonly coEditedTotal: number;
}

const HEX_64 = /^[a-f0-9]{64}$/;

export function sha256Of(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Build the manifest for an install. Sorted so the same install always produces
 * the same bytes, and never listing the manifest itself — a file cannot carry the
 * hash of contents that include that hash.
 */
export function buildInstallManifest(version: string, files: readonly ManifestFile[]): InstallManifest {
  const kept = files
    .filter((file) => file.path !== INSTALL_MANIFEST_PATH)
    .map((file) => ({ path: file.path, sha256: file.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { schemaVersion: 1, version, files: Object.freeze(kept) };
}

function isManifestFile(value: unknown): value is ManifestFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  return typeof file.path === 'string'
    && isSafeRelativePath(file.path)
    && typeof file.sha256 === 'string'
    && HEX_64.test(file.sha256);
}

/**
 * Parse a manifest body, or `undefined` when it is not one. Strict on purpose:
 * a half-trusted manifest would let `hydrate` claim a proof it never performed.
 */
export function parseInstallManifest(body: string): InstallManifest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const manifest = value as Record<string, unknown>;
  const files = manifest.files;
  if (
    manifest.schemaVersion !== 1
    || typeof manifest.version !== 'string'
    || manifest.version === ''
    || !Array.isArray(files)
    || !files.every(isManifestFile)
  ) {
    return undefined;
  }
  return { schemaVersion: 1, version: manifest.version, files: files as ManifestFile[] };
}

/**
 * The committed manifest of an installation, or nothing when it cannot be read
 * or parsed. One reader, because two callers now ask the same question and a
 * second copy is how the two answers start disagreeing.
 */
export function readInstallManifest(root: string): InstallManifest | undefined {
  try {
    return parseInstallManifest(readFileSync(join(root, ...INSTALL_MANIFEST_PATH.split('/')), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Has this path still got the exact bytes the harness wrote into it?
 *
 * The mirror image of the `coEdited` verdict below, asked of a single file. A
 * co-owned file that differs is the project writing into it as invited; a
 * co-owned file that does NOT differ has never been used, and that is the only
 * state in which the harness may replace it rather than preserve it.
 *
 * Decidable, never guessed: the manifest is the committed record of what an
 * install actually put there, whatever version wrote it. A path the manifest
 * cannot attest -- an install predating the manifest, a file we never wrote --
 * answers `false`, because silence is not proof that nobody edited it.
 */
export function isUntouchedSinceInstall(
  manifest: InstallManifest,
  path: string,
  content: Uint8Array | string,
): boolean {
  const attested = manifest.files.find((file) => file.path === path);
  if (attested === undefined) return false;
  return sha256Of(content) === attested.sha256;
}

/**
 * Recompute every hash on disk and report the drift. An unreadable file counts
 * as missing rather than throwing: the caller wants a verdict on the whole
 * install, not the first failure.
 *
 * A differing CO-OWNED file is not drift. `.void/PROJECT-DOCTRINE.md` is created
 * once from a template and the project is told to edit it freely; `CLAUDE.md` and
 * `.gitignore` carry a harness block inside a document the project also writes.
 * Their hashes stop matching the first time anyone uses them as intended, and
 * counting that as drift made `doctor` exit non-zero on normal work while naming
 * `hydrate` as the remedy -- which restores nothing there, it re-stamps the hash
 * over whatever the project wrote. A red verdict nobody can extinguish is a red
 * verdict everybody learns to skip past.
 *
 * A co-owned file that is GONE is still reported: co-ownership licences writing
 * into the file, never removing it.
 */
export function verifyInstallManifest(root: string, manifest: InstallManifest): ManifestVerification {
  const missing: string[] = [];
  const mismatched: string[] = [];
  const coEdited: string[] = [];
  let verified = 0;

  for (const file of manifest.files) {
    let content: Buffer;
    try {
      content = readFileSync(join(root, ...file.path.split('/')));
    } catch {
      missing.push(file.path);
      continue;
    }
    if (sha256Of(content) === file.sha256) verified += 1;
    else if (isCoOwned(file.path)) coEdited.push(file.path);
    else mismatched.push(file.path);
  }

  return {
    ok: missing.length === 0 && mismatched.length === 0,
    verified,
    missing: missing.slice(0, MAX_REPORTED),
    missingTotal: missing.length,
    mismatched: mismatched.slice(0, MAX_REPORTED),
    mismatchedTotal: mismatched.length,
    coEdited: coEdited.slice(0, MAX_REPORTED),
    coEditedTotal: coEdited.length,
  };
}
