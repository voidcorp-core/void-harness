import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { git } from '../sandbox.js';
import type { CellWorkspace, CellWorkspaceFactory } from './runner.js';
import type { CleanupEvidence } from './evidence.js';

const MAX_FIXTURE_FILES = 256;
const MAX_FIXTURE_BYTES = 4 * 1024 * 1024;
const MAX_UNTRACKED_FILES = 256;
const MAX_UNTRACKED_BYTES = 4 * 1024 * 1024;
const LOCKFILE = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.env(?:\.[^/]*)?)$/;

export interface ConsumerCellWorkspaceFactoryInput {
  readonly sourceCheckout: string;
  readonly parentDirectory?: string;
  readonly artifactTarballPath?: string;
}

function validateFixture(fixture: Readonly<Record<string, string>>): void {
  const entries = Object.entries(fixture);
  const totalBytes = entries.reduce(
    (total, [, content]) => total + Buffer.byteLength(content, 'utf8'),
    0,
  );
  if (entries.length === 0 || entries.length > MAX_FIXTURE_FILES || totalBytes > MAX_FIXTURE_BYTES) {
    throw new Error('fixture is not bounded');
  }
  for (const [path, content] of entries) {
    const segments = path.split('/');
    if (
      path.length === 0
      || path.length > 512
      || isAbsolute(path)
      || path.includes('\\')
      || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
      || path === '.git'
      || path.startsWith('.git/')
      || LOCKFILE.test(path)
      || Buffer.byteLength(content, 'utf8') > 512 * 1024
      || content.includes('\0')
    ) throw new Error('fixture path or content is invalid');
  }
}

function copyCheckout(sourceCheckout: string, target: string): void {
  const sourceStatus = git(sourceCheckout, 'status', '--porcelain').trim();
  if (sourceStatus !== '') throw new Error('consumer checkout must be clean');
  cpSync(sourceCheckout, target, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const local = relative(sourceCheckout, source);
      return local === '' || !local.split('/').includes('.git');
    },
  });
}

function writeFixture(target: string, fixture: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(fixture)) {
    const fullPath = join(target, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
  git(target, 'init', '-q', '-b', 'main');
  git(target, 'add', '-A');
  const paths = Object.keys(fixture);
  git(target, 'add', '-f', '--', ...paths);
  git(target, 'commit', '-q', '-m', 'fixture: initial state');
}

/** Build the local package install command with a fixed, shell-free argv. */
export function buildConsumerArtifactInstallInvocation(packageDirectory: string): {
  readonly command: 'node';
  readonly args: readonly string[];
} {
  return {
    command: 'node',
    args: [
      join(packageDirectory, 'package', 'bin', 'void-harness.mjs'),
      'init',
      '--runtime',
      'codex',
      '--no-interactive',
      '--preserve-doctrine',
      '--force',
    ],
  };
}

function installArtifact(target: string, tarballPath: string, parentDirectory: string): void {
  const packageDirectory = mkdtempSync(join(parentDirectory, 'void-package-'));
  try {
    execFileSync('tar', ['-xzf', tarballPath, '-C', packageDirectory], { encoding: 'utf8' });
    const invocation = buildConsumerArtifactInstallInvocation(packageDirectory);
    execFileSync(invocation.command, invocation.args, {
      cwd: target,
      encoding: 'utf8',
      env: { PATH: process.env['PATH'], CI: '1' },
    });
  } finally {
    rmSync(packageDirectory, { recursive: true, force: true });
  }
}

function workspaceDiff(target: string, baseSha: string): string {
  const tracked = git(target, 'diff', '--binary', baseSha);
  const untracked = git(target, 'ls-files', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter((path) => path !== '')
    .sort();
  if (untracked.length > MAX_UNTRACKED_FILES) throw new Error('untracked file count is not bounded');
  if (untracked.length === 0) return tracked;
  let untrackedBytes = 0;
  const additions = untracked.map((path) => {
    const fullPath = join(target, path);
    if (!lstatSync(fullPath).isFile()) throw new Error(`untracked file '${path}' is not readable`);
    const content = readFileSync(fullPath, 'utf8');
    untrackedBytes += Buffer.byteLength(content, 'utf8');
    if (untrackedBytes > MAX_UNTRACKED_BYTES) throw new Error('untracked file bytes are not bounded');
    return `\n--- untracked ${path} ---\n${content}`;
  });
  return `${tracked}${additions.join('')}`;
}

function cleanup(target: string): CleanupEvidence {
  try {
    rmSync(target, { recursive: true, force: true });
    return existsSync(target)
      ? { kind: 'incomplete', attempts: 1, leftovers: ['workspace-directory'], detail: 'workspace remains' }
      : { kind: 'complete', attempts: 1 };
  } catch {
    return {
      kind: 'incomplete',
      attempts: 1,
      leftovers: ['workspace-directory'],
      detail: 'workspace cleanup failed',
    };
  }
}

/** Make a full local copy of a clean consumer checkout for one isolated cell. */
export function createConsumerCellWorkspaceFactory(
  input: ConsumerCellWorkspaceFactoryInput,
): CellWorkspaceFactory {
  const parentDirectory = input.parentDirectory ?? tmpdir();
  return {
    create(fixture): CellWorkspace {
      validateFixture(fixture);
      const target = mkdtempSync(join(parentDirectory, 'void-consumer-'));
      try {
        copyCheckout(input.sourceCheckout, target);
        if (input.artifactTarballPath !== undefined) {
          installArtifact(target, input.artifactTarballPath, parentDirectory);
        }
        writeFixture(target, fixture);
        const baseSha = git(target, 'rev-parse', 'HEAD').trim();
        return {
          dir: target,
          baseSha,
          diff: () => workspaceDiff(target, baseSha),
          cleanup: () => cleanup(target),
        };
      } catch (error) {
        cleanup(target);
        throw error;
      }
    },
  };
}
