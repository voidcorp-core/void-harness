import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

function code(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Register one canonical project root for cross-project audit discovery.
 * Existing pointers are immutable; a collision or symlink is rejected.
 */
export async function registerProjectRoot(
  root: string,
  globalDir: string,
): Promise<void> {
  const canonicalRoot = await realpath(resolve(root));
  const base = resolve(globalDir);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const canonicalBase = await realpath(base);
  const projects = join(base, 'projects');
  await mkdir(projects, { recursive: true, mode: 0o700 });
  const info = await lstat(projects);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('HOOK_UNSAFE_REGISTRY: projects must be a real directory');
  }
  const canonicalProjects = await realpath(projects);
  if (!within(canonicalBase, canonicalProjects)) {
    throw new Error('HOOK_REGISTRY_ESCAPE: projects resolves outside global dir');
  }
  const slug = createHash('sha256')
    .update(canonicalRoot)
    .digest('hex')
    .slice(0, 32);
  const pointer = join(projects, `${slug}.path`);
  try {
    const handle = await open(pointer, 'wx', 0o600);
    try {
      await handle.writeFile(`${canonicalRoot}\n`, 'utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (code(error) !== 'EEXIST') throw error;
    const pointerInfo = await lstat(pointer);
    if (!pointerInfo.isFile() || pointerInfo.isSymbolicLink()) {
      throw new Error('HOOK_UNSAFE_REGISTRY: pointer must be a regular file');
    }
    if ((await readFile(pointer, 'utf8')).trim() !== canonicalRoot) {
      throw new Error('HOOK_REGISTRY_COLLISION: pointer owns another root');
    }
  }
}
