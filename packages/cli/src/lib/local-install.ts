import { createHash } from 'node:crypto';
import { existsSync, type Stats } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  buildInstallReceipt,
  encodeReceipt,
  INSTALL_RECEIPT_PATH,
  readInstallReceipt,
  type InstallReceipt,
  type ReceiptFileInput,
} from './receipts.js';
import type { InstallSource } from './runtime-assets.js';
import type { Runtime } from './runtime.js';
import type { FileMutation } from './transaction.js';

const SHARED_FILES = [
  '.void/config.json',
  '.void/PROJECT-DOCTRINE.md',
  '.claude/settings.json',
  'CLAUDE.md',
  'AGENTS.md',
] as const;

const MANAGED_PREFIXES = [
  '.void/hooks/',
  '.claude/skills/',
  '.claude/agents/',
  '.claude/commands/',
  '.agents/skills/',
] as const;

const MANAGED_FILES = new Set([
  '.void/PHILOSOPHY.md',
  '.codex/hooks.json',
]);

function digest(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function isManaged(path: string): boolean {
  return MANAGED_FILES.has(path) || MANAGED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function infoOrUndefined(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch {
    return undefined;
  }
}

export async function seedInstallStage(projectRoot: string, stageRoot: string): Promise<void> {
  for (const path of SHARED_FILES) {
    const source = join(projectRoot, ...path.split('/'));
    if (!existsSync(source)) continue;
    const destination = join(stageRoot, ...path.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

async function collectStageFiles(stageRoot: string): Promise<ReceiptFileInput[]> {
  const files: ReceiptFileInput[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`staged asset is a symbolic link: ${path}`);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const info = await lstat(path);
        files.push({
          path: relative(resolve(stageRoot), path).split('\\').join('/'),
          content: await readFile(path),
          mode: info.mode & 0o777,
        });
      }
    }
  }
  await visit(stageRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function sameOwnedFile(
  content: Uint8Array,
  mode: number,
  owned: InstallReceipt['files'][number],
): boolean {
  return digest(content) === owned.sha256 && (mode & 0o777) === owned.mode;
}

export interface PrepareInstallInput {
  readonly projectRoot: string;
  readonly stageRoot: string;
  readonly version: string;
  readonly source: InstallSource;
  readonly runtimes: readonly Runtime[];
  readonly force: boolean;
  /** Runtime-add mode: keep unchanged ownership not represented in this partial stage. */
  readonly retainPreviousOwned?: boolean;
}

export interface PreparedInstall {
  readonly mutations: readonly FileMutation[];
  readonly receipt: InstallReceipt;
}

/**
 * Turn an isolated compiled stage into a finite, receipt-backed transaction.
 * Existing shared files may be patched but are never claimed. Existing native
 * assets need a prior receipt or explicit force; force still does not seize
 * deletion ownership.
 */
export async function prepareInstallCommit(input: PrepareInstallInput): Promise<PreparedInstall> {
  const staged = await collectStageFiles(input.stageRoot);
  const previous = await readInstallReceipt(input.projectRoot);
  const previousFiles = new Map((previous?.files ?? []).map((file) => [file.path, file]));
  const stagedPaths = new Set(staged.map((file) => file.path));
  const owned: ReceiptFileInput[] = [];
  const mutations: FileMutation[] = [];

  for (const file of staged) {
    const target = join(input.projectRoot, ...file.path.split('/'));
    const info = await infoOrUndefined(target);
    if (info?.isSymbolicLink()) throw new Error(`unowned asset conflict at symbolic link ${file.path}`);
    if (info !== undefined && !info.isFile()) throw new Error(`unowned asset conflict at ${file.path}`);
    const current = info === undefined ? undefined : await readFile(target);
    const currentMode = info?.mode ?? 0;
    const priorOwnership = previousFiles.get(file.path);
    const stillOwned = current !== undefined
      && priorOwnership !== undefined
      && sameOwnedFile(current, currentMode, priorOwnership);
    const changed = current === undefined
      || !current.equals(Buffer.from(file.content))
      || (currentMode & 0o777) !== file.mode;

    if (
      changed
      && current !== undefined
      && isManaged(file.path)
      && !stillOwned
      && !input.force
    ) {
      throw new Error(`unowned asset conflict at ${file.path}; preserve it or re-run with --force`);
    }
    if (changed) mutations.push({ path: file.path, content: file.content, mode: file.mode });
    if (current === undefined || stillOwned) owned.push(file);
  }

  for (const prior of previous?.files ?? []) {
    if (stagedPaths.has(prior.path)) continue;
    const target = join(input.projectRoot, ...prior.path.split('/'));
    const info = await infoOrUndefined(target);
    if (info?.isFile() && !info.isSymbolicLink()) {
      const content = await readFile(target);
      if (!sameOwnedFile(content, info.mode, prior)) continue;
      if (input.retainPreviousOwned) {
        owned.push({ path: prior.path, content, mode: prior.mode });
      } else {
        mutations.push({ path: prior.path, remove: true });
      }
    }
  }

  const receipt = buildInstallReceipt({
    version: input.version,
    source: input.source,
    runtimes: input.runtimes,
    files: owned,
  });
  mutations.push({
    path: INSTALL_RECEIPT_PATH,
    content: Buffer.from(encodeReceipt(receipt)),
    mode: 0o644,
  });
  return { mutations, receipt };
}
