import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  readlink,
  realpath,
} from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const MAX_GIT_BYTES = 64 * 1024 * 1024;
const MAX_CHANGED_FILES = 10_000;

export interface ProjectState {
  readonly diffHash: string;
  readonly affectedNodes: readonly string[];
}

function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function git(
  root: string,
  args: readonly string[],
  allowFailure = false,
): Buffer {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: MAX_GIT_BYTES,
    shell: false,
  });
  if (result.error !== undefined) {
    throw new Error(`MISSION_GIT_FAILED: ${result.error.message}`);
  }
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `MISSION_GIT_FAILED: ${String(result.stderr).trim() || args.join(' ')}`,
    );
  }
  return result.status === 0 && Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.alloc(0);
}

function diffArgs(cached: boolean, namesOnly: boolean): readonly string[] {
  return [
    'diff',
    ...(cached ? ['--cached'] : []),
    '--no-ext-diff',
    ...(namesOnly ? ['--name-only', '-z'] : ['--binary']),
    '--',
    '.',
    ':(exclude).void/**',
  ];
}

async function untrackedFiles(root: string): Promise<readonly string[]> {
  const raw = git(root, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    '.',
    ':(exclude).void/**',
  ]);
  const paths = raw.toString('utf8').split('\0').filter(Boolean).sort();
  if (paths.length > MAX_CHANGED_FILES) {
    throw new Error(`MISSION_DIFF_TOO_LARGE: over ${MAX_CHANGED_FILES} files`);
  }
  return paths;
}

export async function computeProjectState(root: string): Promise<ProjectState> {
  const canonicalRoot = await realpath(resolve(root));
  git(root, ['rev-parse', '--is-inside-work-tree']);
  const hash = createHash('sha256');
  const head = git(root, ['rev-parse', '--verify', 'HEAD'], true);
  const staged = git(root, diffArgs(true, false));
  const unstaged = git(root, diffArgs(false, false));
  const trackedBytes = staged.byteLength + unstaged.byteLength;
  if (trackedBytes > MAX_GIT_BYTES) {
    throw new Error(`MISSION_DIFF_TOO_LARGE: over ${MAX_GIT_BYTES} bytes`);
  }
  hash.update('head\0').update(head).update('\0staged\0').update(staged);
  hash.update('\0unstaged\0').update(unstaged);
  const untracked = await untrackedFiles(root);
  let totalBytes = trackedBytes;
  for (const path of untracked) {
    const absolute = resolve(canonicalRoot, path);
    if (!within(canonicalRoot, absolute)) {
      throw new Error('MISSION_PATH_ESCAPE: untracked file escaped project');
    }
    const info = await lstat(absolute);
    if (!info.isFile() && !info.isSymbolicLink()) continue;
    const content = info.isSymbolicLink()
      ? Buffer.from(await readlink(absolute), 'utf8')
      : await readFile(absolute);
    totalBytes += content.byteLength;
    if (totalBytes > MAX_GIT_BYTES) {
      throw new Error(`MISSION_DIFF_TOO_LARGE: over ${MAX_GIT_BYTES} bytes`);
    }
    hash.update('\0untracked\0').update(path).update('\0');
    hash.update(content);
  }
  const names = [
    ...git(root, diffArgs(true, true)).toString('utf8').split('\0'),
    ...git(root, diffArgs(false, true)).toString('utf8').split('\0'),
    ...untracked,
  ]
    .filter(Boolean)
    .sort();
  return {
    diffHash: `sha256:${hash.digest('hex')}`,
    affectedNodes: [...new Set(names)]
      .slice(0, MAX_CHANGED_FILES)
      .map((path) => `file:${path.slice(0, 500)}`),
  };
}
