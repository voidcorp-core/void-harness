import { createHash } from 'node:crypto';
import { existsSync, type Stats } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  buildInstallManifest,
  INSTALL_MANIFEST_PATH,
  parseInstallManifest,
  sha256Of,
} from './install-manifest.js';
import {
  buildInstallReceipt,
  encodeReceipt,
  INSTALL_RECEIPT_PATH,
  type InstallReceipt,
  type OwnedFile,
  type ReceiptFileInput,
  readHistoricalInstallReceipts,
  readInstallReceipt,
} from './receipts.js';
import type { Runtime } from './runtime.js';
import type { InstallSource } from './runtime-assets.js';
import type { FileMutation } from './transaction.js';

const SHARED_FILES = [
  // Co-owned in the strongest sense: the harness owns exactly its marked block,
  // the project owns every other line. Seeding it here is what lets init patch
  // the block instead of writing a file over whatever the project had.
  '.gitignore',
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
  '.codex/agents/',
] as const;

const MANAGED_FILES = new Set([
  INSTALL_MANIFEST_PATH,
  '.void/installed/PHILOSOPHY.md',
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

export async function collectStageFiles(stageRoot: string): Promise<ReceiptFileInput[]> {
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

/**
 * A current manifest can repair missing per-file receipt entries only when the
 * active receipt itself still owns that manifest byte-for-byte. The caller then
 * combines its content hash with the staged file's mode; the manifest is never
 * used to authorize deletion of a path the new install does not stage.
 */
async function receiptOwnedManifestHashes(
  projectRoot: string,
  receipt: InstallReceipt | undefined,
): Promise<ReadonlyMap<string, string>> {
  if (receipt === undefined) return new Map();
  const ownership = receipt.files.find((file) => file.path === INSTALL_MANIFEST_PATH);
  if (ownership === undefined) return new Map();
  const path = join(projectRoot, ...INSTALL_MANIFEST_PATH.split('/'));
  const info = await infoOrUndefined(path);
  if (info === undefined || !info.isFile() || info.isSymbolicLink()) return new Map();
  const content = await readFile(path);
  if (!sameOwnedFile(content, info.mode, ownership)) return new Map();
  const manifest = parseInstallManifest(content.toString('utf8'));
  if (manifest === undefined || manifest.version !== receipt.version) return new Map();
  return new Map(manifest.files.map((file) => [file.path, file.sha256]));
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
  /**
   * Assets the previous receipt owned that this install refuses to remove,
   * because their bytes no longer match what we wrote. Kept on purpose, and
   * surfaced so the caller can say so: a renamed skill preserved this way goes
   * on loading beside its replacement, and a silent success reads as a project
   * with one doctrine when it has two.
   */
  readonly preserved: readonly string[];
}

/**
 * Turn an isolated compiled stage into a finite, receipt-backed transaction.
 * Existing shared files may be patched but are never claimed. Existing native
 * assets need a prior receipt or explicit force; force still does not seize
 * deletion ownership.
 */
/**
 * Write the committed manifest into the stage, so it publishes with everything
 * else and describes exactly this install. Called before `prepareInstallCommit`,
 * which then picks it up as one more staged file — the manifest excludes itself,
 * since a file cannot carry the hash of contents that include that hash.
 */
export async function stageInstallManifest(stageRoot: string, version: string): Promise<void> {
  const staged = await collectStageFiles(stageRoot);
  const manifest = buildInstallManifest(
    version,
    staged.map((file) => ({ path: file.path, sha256: sha256Of(file.content) })),
  );
  const target = join(stageRoot, ...INSTALL_MANIFEST_PATH.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * The repo-relative paths this install stages, i.e. exactly what the receipt will
 * claim. `init` uses it to write an ignore block scoped to files the harness
 * owns, rather than to whole runtime directories the project also writes into.
 */
export async function stagedRelativePaths(stageRoot: string): Promise<string[]> {
  return (await collectStageFiles(stageRoot)).map((file) => file.path);
}

export async function prepareInstallCommit(input: PrepareInstallInput): Promise<PreparedInstall> {
  const staged = await collectStageFiles(input.stageRoot);
  const previous = await readInstallReceipt(input.projectRoot);
  const manifestHashes = await receiptOwnedManifestHashes(input.projectRoot, previous);
  const historical = await readHistoricalInstallReceipts(input.projectRoot);
  const previousFiles = new Map<string, OwnedFile[]>();
  const activePaths = new Set<string>();
  for (const file of previous?.files ?? []) {
    if (!isManaged(file.path)) continue;
    previousFiles.set(file.path, [file]);
    activePaths.add(file.path);
  }
  for (const receipt of historical) {
    for (const file of receipt.files) {
      // Older receipt schemas claimed shared project files. Historical recovery
      // may prove ownership only inside the current managed boundary, and only
      // when the active receipt omitted the path. An active entry is the latest
      // ownership fact and must not gain older hashes as alternate proofs.
      if (!isManaged(file.path) || activePaths.has(file.path)) continue;
      const proofs = previousFiles.get(file.path) ?? [];
      proofs.push(file);
      previousFiles.set(file.path, proofs);
    }
  }
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
    const priorOwnership = previousFiles.get(file.path) ?? [];
    const matchesOwnedManifest = current !== undefined
      && isManaged(file.path)
      && manifestHashes.get(file.path) === digest(current)
      && (currentMode & 0o777) === file.mode;
    const stillOwned = current !== undefined
      && (
        priorOwnership.some((proof) => sameOwnedFile(current, currentMode, proof))
        || matchesOwnedManifest
      );
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

  const preserved: string[] = [];
  for (const [path, proofs] of previousFiles) {
    if (stagedPaths.has(path)) continue;
    const target = join(input.projectRoot, ...path.split('/'));
    const info = await infoOrUndefined(target);
    if (info?.isFile() && !info.isSymbolicLink()) {
      const content = await readFile(target);
      // Edited by hand since we wrote it, so it is not ours to delete. Reported
      // rather than skipped in silence: a renamed skill kept this way stays on
      // disk and keeps loading, and `update` used to print a clean success over
      // a project running two versions of its own doctrine.
      const matchingProof = proofs.find((proof) => sameOwnedFile(content, info.mode, proof));
      if (matchingProof === undefined) {
        preserved.push(path);
        continue;
      }
      if (input.retainPreviousOwned) {
        owned.push({ path, content, mode: matchingProof.mode });
      } else {
        mutations.push({ path, remove: true });
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
  return { mutations, receipt, preserved };
}
