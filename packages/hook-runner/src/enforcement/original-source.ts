import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { MAX_SOURCE_BYTES } from './proposed-source.js';

export type OriginalSource =
  | { readonly kind: 'absent' }
  | { readonly kind: 'read'; readonly header: string; readonly source: string | undefined }
  | { readonly kind: 'unavailable' };

export function readOriginalSource(path: string): OriginalSource {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = fstatSync(descriptor);
    if (!before.isFile()) return { kind: 'unavailable' };
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(descriptor, buffer, size, buffer.length - size, size);
      if (count === 0) break;
      size += count;
    }
    const after = fstatSync(descriptor);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || size !== Math.min(before.size, buffer.length)) return { kind: 'unavailable' };
    return { kind: 'read', header: buffer.subarray(0, Math.min(size, 8192)).toString('utf8'),
      source: size <= MAX_SOURCE_BYTES ? buffer.subarray(0, size).toString('utf8') : undefined };
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? { kind: 'absent' } : { kind: 'unavailable' };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

