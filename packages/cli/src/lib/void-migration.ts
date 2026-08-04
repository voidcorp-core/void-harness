// Move a project from the pre-split `.void/` to the declared/observed layout.
//
// Runs from `update`, on every install source, because this is a layout concern
// and not a marketplace one. It is deliberately conservative: it MOVES observed
// artifacts and never merges, never overwrites, and never deletes. A destination
// that already exists is reported as a conflict and left untouched — telemetry is
// cheap, but silently clobbering a run journal that a reconciliation is reading
// is not.
//
// The migration itself never touches git: moving a tracked file already shows up
// as a deletion plus an ignored path, which is exactly the change the project
// should commit. `untrackDerived` is the one git-touching function here, and it
// runs only behind an explicit `--untrack-derived` — rewriting someone's index is
// their call, not a side effect of updating.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readInstallReceipt } from './receipts.js';
import {
  derivedIgnoreEntries,
  isOwnedDerived,
  legacyVoidPath,
  patchGitignore,
  pendingMigrations,
  voidLocalDir,
  voidLocalPath,
} from '@voidcorp/hook-runner';

export interface VoidMigrationResult {
  /** Entries moved under `.void/local/`. */
  readonly moved: readonly string[];
  /** Entries left alone because the destination already held something. */
  readonly conflicts: readonly string[];
  /** True when the managed `.gitignore` block was added or refreshed. */
  readonly gitignoreTouched: boolean;
}

const EMPTY: VoidMigrationResult = Object.freeze({ moved: [], conflicts: [], gitignoreTouched: false });

/**
 * What a migration would do, without doing it. Pure apart from the existence
 * checks it needs, and the exact list `migrateVoidLayout` will act on.
 */
export function planVoidMigration(root: string): { readonly movable: string[]; readonly conflicts: string[] } {
  const movable: string[] = [];
  const conflicts: string[] = [];
  for (const entry of pendingMigrations(root)) {
    if (existsSync(voidLocalPath(root, entry))) conflicts.push(entry);
    else movable.push(entry);
  }
  return { movable, conflicts };
}

/**
 * The repo-relative paths the install receipt claims AND that are derived and
 * safe to leave out of a clone. `undefined` when no receipt is readable, which
 * callers must treat as "prove nothing, touch nothing".
 */
export async function ownedDerivedPaths(root: string): Promise<Set<string> | undefined> {
  const receipt = await readInstallReceipt(root);
  if (receipt === undefined) return undefined;
  return new Set(receipt.files.map((file) => file.path).filter((path) => isOwnedDerived(path)));
}

/** The ignore entries for this project, scoped to what the receipt owns. */
export async function projectDerivedIgnoreEntries(root: string): Promise<string[]> {
  const owned = await ownedDerivedPaths(root);
  return owned === undefined ? [] : derivedIgnoreEntries([...owned]);
}

export interface UntrackResult {
  /** Paths dropped from the index (still on disk), or that would be. */
  readonly untracked: readonly string[];
  /** Set when git refused or was unavailable; nothing was changed. */
  readonly error?: string;
}

/**
 * Drop regenerated content from the index while leaving every byte on disk.
 *
 * Explicit by construction — `update` only does this behind `--untrack-derived`.
 * Rewriting a project's index is the project's call: the files are theirs, the
 * commit is theirs, and a migration that quietly staged 126 deletions would be a
 * side effect nobody asked for.
 */
export async function untrackDerived(root: string, dryRun = false): Promise<UntrackResult> {
  // The receipt is the ownership truth. Without it there is nothing this may
  // safely claim: `.claude/skills/` also holds skills the project wrote itself,
  // and dropping one of those from the index would be data loss by inference.
  const owned = await ownedDerivedPaths(root);
  if (owned === undefined) {
    return { untracked: [], error: 'no readable install receipt — nothing here can be proven harness-owned' };
  }

  let listed: string;
  try {
    listed = execFileSync('git', ['ls-files', '-z', '--', '.void', '.claude', '.agents', '.codex'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return { untracked: [], error: 'not a git repository, or git is unavailable' };
  }

  const untracked = listed
    .split('\0')
    .filter((path) => path !== '' && owned.has(path.split('\\').join('/')));
  if (untracked.length === 0 || dryRun) return { untracked };

  try {
    // `--cached` is the whole point: the index forgets them, the working tree
    // keeps them, and the runtimes keep loading them until the next install.
    // Batched to stay under the platform argument limit on a large catalogue.
    for (let index = 0; index < untracked.length; index += 200) {
      execFileSync('git', ['rm', '--cached', '--quiet', '--', ...untracked.slice(index, index + 200)], {
        cwd: root,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    }
  } catch (error) {
    return { untracked: [], error: error instanceof Error ? error.message.split('\n')[0] ?? 'git rm failed' : 'git rm failed' };
  }
  return { untracked };
}

/**
 * Move observed state under `.void/local/` and install the managed `.gitignore`
 * block. Idempotent: a migrated project reports nothing moved and an unchanged
 * ignore file. `dryRun` computes the same answer and writes nothing.
 */
export async function migrateVoidLayout(root: string, dryRun = false): Promise<VoidMigrationResult> {
  if (!existsSync(join(root, '.void'))) return EMPTY;

  const { movable, conflicts } = planVoidMigration(root);
  const gitignorePath = join(root, '.gitignore');
  const original = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf8') : '';
  const patched = patchGitignore(original, await projectDerivedIgnoreEntries(root));
  const gitignoreTouched = patched !== original;

  if (dryRun) return { moved: movable, conflicts, gitignoreTouched };

  if (movable.length > 0) await mkdir(voidLocalDir(root), { recursive: true });
  const moved: string[] = [];
  for (const entry of movable) {
    try {
      await rename(legacyVoidPath(root, entry), voidLocalPath(root, entry));
      moved.push(entry);
    } catch {
      // A rename that fails (permissions, a cross-device .void, a file held open
      // by a running session) is reported as a conflict rather than aborting the
      // whole update: the old path still works, because every reader falls back.
      conflicts.push(entry);
    }
  }
  if (gitignoreTouched) await writeFile(gitignorePath, patched);

  return { moved, conflicts: conflicts.sort(), gitignoreTouched };
}
