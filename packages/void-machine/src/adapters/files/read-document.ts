// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

export type DocumentRead =
  | { readonly kind: 'read'; readonly text: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'malformed'; readonly cause: string }
  | { readonly kind: 'unreadable'; readonly cause: string };

const MAX_DOCUMENT_BYTES = 65_536;

export function readDocument(path: string): DocumentRead {
  try {
    // Node 22 fs open/fstat/read: nonblocking avoids waiting on special files.
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) return { kind: 'unreadable', cause: 'Expected a regular file' };
      if (stat.size > MAX_DOCUMENT_BYTES) return tooLarge();
      const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, length);
        if (count === 0) break;
        length += count;
      }
      if (length > MAX_DOCUMENT_BYTES) return tooLarge();
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
        return { kind: 'read', text };
      } catch {
        return { kind: 'malformed', cause: 'Document must contain valid UTF-8' };
      }
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    return { kind: 'unreadable', cause: 'File contents are unavailable' };
  }
}

function tooLarge(): DocumentRead {
  return { kind: 'malformed', cause: 'Document exceeds the 65536-byte input limit' };
}
