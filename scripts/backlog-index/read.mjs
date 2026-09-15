// Bounded descriptor reads prevent FIFO hangs and file-growth bypasses.
// https://nodejs.org/download/release/v24.15.0/docs/api/fs.html#file-system-flags
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { requireValue } from './schema.mjs';

export function readBounded(path, limit) {
  requireValue(Number.isInteger(constants.O_NOFOLLOW) && Number.isInteger(constants.O_NONBLOCK),
    'Platform lacks safe nonblocking no-follow reads');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    requireValue(stat.isFile() && stat.size <= limit, 'Input must be a bounded regular file');
    const chunks = [];
    let total = 0;
    while (total <= limit) {
      const buffer = Buffer.alloc(Math.min(65536, limit + 1 - total));
      const bytes = readSync(fd, buffer, 0, buffer.length);
      if (bytes === 0) break;
      chunks.push(buffer.subarray(0, bytes));
      total += bytes;
    }
    requireValue(total <= limit, 'Input too large');
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally { closeSync(fd); }
}
