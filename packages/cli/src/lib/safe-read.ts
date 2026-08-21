import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export interface BoundedProjectFile {
  readonly body: string;
  readonly resolvedPath: string;
}

interface BoundedProjectFileOptions {
  readonly root: string;
  readonly inputPath: string;
  readonly maxBytes: number;
  readonly pathEscapeMessage: string;
  readonly invalidMessage: string;
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

/** Read through one no-follow descriptor, then prove the opened inode still
 * resolves beneath the project root before consuming it. */
export async function readBoundedProjectFile(
  options: BoundedProjectFileOptions,
  afterOpen: () => Promise<void> = async () => Promise.resolve(),
): Promise<BoundedProjectFile> {
  const canonicalRoot = await realpath(resolve(options.root));
  const initialPath = await realpath(resolve(canonicalRoot, options.inputPath));
  if (!isWithin(canonicalRoot, initialPath)) {
    throw new Error(options.pathEscapeMessage);
  }
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(initialPath, flags);
  try {
    await afterOpen();
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > options.maxBytes) {
      throw new Error(options.invalidMessage);
    }
    const resolvedPath = await realpath(initialPath);
    const current = await stat(resolvedPath);
    if (
      !isWithin(canonicalRoot, resolvedPath)
      || opened.dev !== current.dev
      || opened.ino !== current.ino
    ) {
      throw new Error(options.invalidMessage);
    }
    return Object.freeze({
      body: await handle.readFile('utf8'),
      resolvedPath,
    });
  } finally {
    await handle.close();
  }
}
