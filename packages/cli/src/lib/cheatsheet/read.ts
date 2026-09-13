// tdd-cover: e2e test/cli/cheatsheet.test.ts
import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export type DataRead = { readonly state: 'read'; readonly body: string }
  | { readonly state: 'missing' | 'unknown' };
const within = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path);
};

/** Node 22 fs contract: bound the descriptor read itself, not just its initial size.
 * https://nodejs.org/docs/latest-v22.x/api/fs.html#filehandlereadbuffer-options
 */
export async function readData(root: string, path: string, maxBytes: number): Promise<DataRead> {
  try {
    const base = await realpath(root);
    const requested = resolve(base, path);
    if (!within(base, requested)) return { state: 'unknown' };
    const info = await lstat(requested);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) return { state: 'unknown' };
    const actual = await realpath(requested);
    if (!within(base, actual)) return { state: 'unknown' };
    const handle = await open(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const opened = await handle.stat();
      const currentPath = await realpath(actual);
      const current = await stat(currentPath);
      if (!opened.isFile() || opened.size > maxBytes || !within(base, currentPath)
        || current.ino !== opened.ino || current.dev !== opened.dev
        || opened.ino !== info.ino || opened.dev !== info.dev) return { state: 'unknown' };
      const bytes = Buffer.alloc(maxBytes + 1);
      let total = 0;
      while (total < bytes.length) {
        const { bytesRead } = await handle.read(bytes, total, bytes.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > maxBytes) return { state: 'unknown' };
      return { state: 'read', body: bytes.subarray(0, total).toString('utf8') };
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { state: error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'unknown' };
  }
}

export async function requireData(root: string, path: string, maxBytes: number): Promise<string> {
  const result = await readData(root, path, maxBytes);
  if (result.state !== 'read') throw new Error('DISCOVERY_DATA_UNAVAILABLE');
  return result.body;
}
