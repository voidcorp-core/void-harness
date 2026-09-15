import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './original-source.js';

describe('original source evidence', () => {
  it('distinguishes a missing source from an unreadable nonregular source', () => {
    const root = mkdtempSync(join(tmpdir(), 'original-source-'));
    expect(readOriginalSource(join(root, 'absent.ts'))).toEqual({ kind: 'absent' });
    mkdirSync(join(root, 'directory.ts'));
    expect(readOriginalSource(join(root, 'directory.ts'))).toEqual({ kind: 'unavailable' });
  });

  it.each([65536, 65537])('retains header evidence independently at %s bytes', (size) => {
    const root = mkdtempSync(join(tmpdir(), 'original-source-limit-'));
    const header = '// tdd-mode: strict\n';
    const content = header + ' '.repeat(size - Buffer.byteLength(header));
    const path = join(root, 'source.ts');
    writeFileSync(path, content);
    const result = readOriginalSource(path);
    expect(result.kind).toBe('read');
    if (result.kind !== 'read') throw new Error('expected readable source');
    expect(result.header.startsWith(header)).toBe(true);
    expect(result.source).toBe(size === 65536 ? content : undefined);
  });
});
