import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, rmdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { voidReadPath } from '@voidcorp/hook-runner';
import type { Runtime } from './runtime.js';
import { isSafeRelativePath } from './transaction.js';

// Observed state: the receipt records what THIS machine installed and the
// hashes it wrote, so it lives under `.void/machine/` with the rest.
export const INSTALL_RECEIPT_PATH = '.void/machine/receipts/install-v1.json';

export interface ReceiptFileInput {
  readonly path: string;
  readonly content: Uint8Array;
  readonly mode: number;
}

export interface OwnedFile {
  readonly path: string;
  readonly sha256: string;
  readonly mode: number;
}

export interface InstallReceipt {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly source: 'local' | 'marketplace';
  readonly runtimes: readonly Runtime[];
  readonly files: readonly OwnedFile[];
}

interface BuildReceiptInput {
  readonly version: string;
  readonly source: InstallReceipt['source'];
  readonly runtimes: readonly Runtime[];
  readonly files: readonly ReceiptFileInput[];
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function buildInstallReceipt(input: BuildReceiptInput): InstallReceipt {
  const runtimes = [...new Set(input.runtimes)].sort() as Runtime[];
  const files = input.files
    .map((file) => ({
      path: file.path,
      sha256: sha256(file.content),
      mode: file.mode & 0o777,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: 1,
    version: input.version,
    source: input.source,
    runtimes,
    files,
  };
}

export function encodeReceipt(receipt: InstallReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

function isOwnedFile(value: unknown): value is OwnedFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  return typeof file.path === 'string'
    && isSafeRelativePath(file.path)
    && typeof file.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(file.sha256)
    && Number.isInteger(file.mode)
    && Number(file.mode) >= 0
    && Number(file.mode) <= 0o777;
}

export function parseReceipt(body: string): InstallReceipt | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const receipt = value as Record<string, unknown>;
  const runtimes = receipt.runtimes;
  const files = receipt.files;
  if (
    receipt.schemaVersion !== 1
    || typeof receipt.version !== 'string'
    || (receipt.source !== 'local' && receipt.source !== 'marketplace')
    || !Array.isArray(runtimes)
    || !runtimes.every((runtime) => runtime === 'claude' || runtime === 'codex')
    || !Array.isArray(files)
    || !files.every(isOwnedFile)
  ) {
    return undefined;
  }
  const paths = files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) return undefined;
  return {
    schemaVersion: 1,
    version: receipt.version,
    source: receipt.source,
    runtimes: runtimes as Runtime[],
    files,
  };
}

export async function readInstallReceipt(projectRoot: string): Promise<InstallReceipt | undefined> {
  try {
    return parseReceipt(await readFile(voidReadPath(projectRoot, 'receipts', 'install-v1.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Receipts parked by the observed-state migration. They remain valid ownership
 * evidence for exact bytes even when a later, partial receipt omitted those
 * paths. Invalid or unrelated files are ignored rather than weakening the
 * active receipt reader.
 */
export async function readHistoricalInstallReceipts(projectRoot: string): Promise<readonly InstallReceipt[]> {
  const receiptPath = voidReadPath(projectRoot, 'receipts', 'install-v1.json');
  const directory = dirname(receiptPath);
  let names: readonly string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }

  const receipts: InstallReceipt[] = [];
  for (const name of [...names].sort()) {
    if (!/^install-v1\.json\.legacy(?:\.\d+|\.overflow)?$/.test(name)) continue;
    try {
      const receipt = parseReceipt(await readFile(join(directory, name), 'utf8'));
      if (receipt !== undefined) receipts.push(receipt);
    } catch {
      // One unreadable historical proof must not hide the other valid ones.
    }
  }
  return receipts;
}

/**
 * Remove the directories a deleted file leaves behind, up to the project root.
 * Exported because the install transaction needs it too: a renamed skill leaves
 * its old directory standing, so `ls .claude/skills` keeps listing skills that
 * no longer have a SKILL.md. Harmless to the runtime, and misleading to everyone
 * reading the directory.
 */
export async function pruneEmptyParents(projectRoot: string, filePath: string): Promise<void> {
  const root = resolve(projectRoot);
  let cursor = dirname(filePath);
  while (cursor !== root && cursor.startsWith(`${root}${sep}`)) {
    try {
      await rmdir(cursor);
      cursor = dirname(cursor);
    } catch {
      return;
    }
  }
}

export interface RemovalResult {
  readonly removed: readonly string[];
  readonly preserved: readonly string[];
}

/**
 * Delete only regular, non-symlink files whose current bytes and mode still
 * match the receipt. User edits and adjacent files are preserved.
 */
export async function removeReceiptOwnedFiles(
  projectRoot: string,
  receipt: InstallReceipt,
): Promise<RemovalResult> {
  const removed: string[] = [];
  const preserved: string[] = [];
  for (const file of receipt.files) {
    const path = join(projectRoot, ...file.path.split('/'));
    try {
      const info = await lstat(path);
      if (
        !info.isFile()
        || info.isSymbolicLink()
        || (info.mode & 0o777) !== file.mode
        || sha256(await readFile(path)) !== file.sha256
      ) {
        preserved.push(file.path);
        continue;
      }
      await unlink(path);
      await pruneEmptyParents(projectRoot, path);
      removed.push(file.path);
    } catch {
      // Missing files are already removed; they are neither collateral nor a failure.
    }
  }
  return { removed, preserved };
}
