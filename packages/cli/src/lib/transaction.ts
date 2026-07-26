import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

export interface FileWriteMutation {
  readonly path: string;
  readonly content: Uint8Array;
  readonly mode?: number;
}

export interface FileRemoveMutation {
  readonly path: string;
  readonly remove: true;
}

export type FileMutation = FileWriteMutation | FileRemoveMutation;

export interface TransactionOptions {
  /** Test-only fault injection: throw immediately after this zero-based mutation. */
  readonly failAfterMutation?: number;
}

interface ExistingSnapshot {
  readonly path: string;
  readonly existed: true;
  readonly backupPath: string;
  readonly mode: number;
}

interface MissingSnapshot {
  readonly path: string;
  readonly existed: false;
}

type Snapshot = ExistingSnapshot | MissingSnapshot;

export function isSafeRelativePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

async function infoOrUndefined(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch {
    return undefined;
  }
}

async function rejectSymlinkPath(projectRoot: string, relativePath: string): Promise<void> {
  let cursor = resolve(projectRoot);
  for (const segment of relativePath.split('/')) {
    cursor = join(cursor, segment);
    const info = await infoOrUndefined(cursor);
    if (info?.isSymbolicLink()) throw new Error(`transaction target crosses a symbolic link: ${relativePath}`);
  }
}

function targetFor(projectRoot: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) throw new Error(`unsafe transaction path: ${relativePath}`);
  const root = resolve(projectRoot);
  const target = resolve(root, ...relativePath.split('/'));
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`unsafe transaction path: ${relativePath}`);
  }
  return target;
}

async function atomicWrite(target: string, content: Uint8Array, mode: number): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.${basename(target)}.void-tx-${randomUUID()}`);
  try {
    await writeFile(temporary, content, { mode });
    await chmod(temporary, mode);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function removeEmptyCreatedDirectories(projectRoot: string, created: readonly string[]): Promise<void> {
  const root = resolve(projectRoot);
  const deepestFirst = [...created].sort((a, b) => b.length - a.length);
  for (const path of deepestFirst) {
    if (path === root) continue;
    try {
      await rmdir(path);
    } catch {
      // Non-empty means it contains pre-existing/user state and must survive.
    }
  }
}

/**
 * Publish a finite file set with an all-or-previous-state guarantee.
 *
 * Every target is validated and snapshotted before the first mutation. Writes
 * use same-directory rename; any failure restores existing bytes + mode and
 * removes only files/directories created by this transaction.
 */
export async function commitFileTransaction(
  projectRoot: string,
  mutations: readonly FileMutation[],
  options: TransactionOptions = {},
): Promise<void> {
  const root = resolve(projectRoot);
  const duplicateGuard = new Set<string>();
  const targets = mutations.map((mutation) => {
    const target = targetFor(root, mutation.path);
    if (duplicateGuard.has(target)) throw new Error(`duplicate transaction path: ${mutation.path}`);
    duplicateGuard.add(target);
    return { mutation, target };
  });
  for (const { mutation } of targets) await rejectSymlinkPath(root, mutation.path);

  const transactionRoot = await mkdtemp(join(dirname(root), `.${basename(root)}.void-tx-`));
  const snapshots: Snapshot[] = [];
  const createdDirectories = new Set<string>();
  try {
    for (const { mutation, target } of targets) {
      const info = await infoOrUndefined(target);
      if (info === undefined) {
        snapshots.push({ path: target, existed: false });
      } else {
        if (!info.isFile()) throw new Error(`transaction target is not a regular file: ${mutation.path}`);
        const backupPath = join(transactionRoot, `${snapshots.length}.bak`);
        await copyFile(target, backupPath);
        snapshots.push({ path: target, existed: true, backupPath, mode: info.mode & 0o777 });
      }
      let parent = dirname(target);
      while (parent !== root && parent.startsWith(`${root}${sep}`)) {
        if ((await infoOrUndefined(parent)) !== undefined) break;
        createdDirectories.add(parent);
        parent = dirname(parent);
      }
    }

    for (let index = 0; index < targets.length; index += 1) {
      const current = targets[index];
      if (current === undefined) continue;
      await rejectSymlinkPath(root, current.mutation.path);
      if ('remove' in current.mutation) {
        await rm(current.target, { force: true });
      } else {
        await atomicWrite(
          current.target,
          current.mutation.content,
          current.mutation.mode ?? 0o644,
        );
      }
      if (options.failAfterMutation === index) {
        throw new Error(`injected transaction failure after mutation ${index}`);
      }
    }
  } catch (error) {
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = snapshots[index];
      if (snapshot === undefined) continue;
      if (snapshot.existed) {
        await atomicWrite(snapshot.path, await readFile(snapshot.backupPath), snapshot.mode);
      } else {
        await rm(snapshot.path, { force: true });
      }
    }
    await removeEmptyCreatedDirectories(root, [...createdDirectories]);
    throw error;
  } finally {
    await rm(transactionRoot, { recursive: true, force: true });
  }
}
