// Move a project from the pre-split `.void/` to the declared/observed layout.
//
// Runs from `update`, on every install source, because this is a layout concern
// and not a marketplace one. It is deliberately conservative: it MOVES observed
// artifacts and never merges, never overwrites, and never deletes. A destination
// that already exists is reported as a conflict and left untouched — telemetry is
// cheap, but silently clobbering a run journal that a reconciliation is reading
// is not.
//
// Nothing here touches git. Moving a tracked file already shows up as a deletion
// plus an ignored path, which is exactly the change the project should commit;
// running `git rm` on the user's behalf would stage work they did not ask for.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
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
 * Move observed state under `.void/local/` and install the managed `.gitignore`
 * block. Idempotent: a migrated project reports nothing moved and an unchanged
 * ignore file. `dryRun` computes the same answer and writes nothing.
 */
export async function migrateVoidLayout(root: string, dryRun = false): Promise<VoidMigrationResult> {
  if (!existsSync(join(root, '.void'))) return EMPTY;

  const { movable, conflicts } = planVoidMigration(root);
  const gitignorePath = join(root, '.gitignore');
  const original = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf8') : '';
  const patched = patchGitignore(original);
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
