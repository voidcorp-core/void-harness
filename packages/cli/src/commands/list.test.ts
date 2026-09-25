import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { list } from './list.js';

const cwd = process.cwd();

afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
});

describe('list', () => {
  it('tells a person to add a pack with the current command', async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    });
    process.chdir(mkdtempSync(join(tmpdir(), 'void-list-')));
    await list([]);
    const out = chunks.join('');
    expect(out).toContain('void-machine add <name>');
    expect(out).not.toMatch(/void-harness/);
  });
});
