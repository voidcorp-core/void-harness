import {
  mkdtemp,
  mkdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_DECISION_BYTES,
  loadDecisions,
} from './load.js';

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'void-decisions-load-'));
}

describe('loadDecisions', () => {
  it('rejects a decisions directory that resolves outside the project', async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(outside, 'external.md'), 'secret', 'utf8');
    await symlink(outside, join(root, 'docs', 'decisions'));

    const loaded = await loadDecisions(root);

    expect(loaded.records).toEqual([]);
    expect(loaded.issues).toEqual([
      expect.objectContaining({
        code: 'unsafe-decision-directory',
        file: 'docs/decisions',
      }),
    ]);
  });

  it('rejects Markdown symlinks instead of reading outside the decisions directory', async () => {
    const root = await tempRoot();
    const directory = join(root, 'docs', 'decisions');
    const outside = join(root, 'outside.md');
    await mkdir(directory, { recursive: true });
    await writeFile(outside, 'secret', 'utf8');
    await symlink(outside, join(directory, 'linked.md'));

    const loaded = await loadDecisions(root);

    expect(loaded.records).toEqual([]);
    expect(loaded.issues).toEqual([
      expect.objectContaining({
        code: 'unsafe-decision-file',
        file: 'docs/decisions/linked.md',
      }),
    ]);
  });

  it('rejects an ADR larger than the bounded parser input', async () => {
    const root = await tempRoot();
    const directory = join(root, 'docs', 'decisions');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'oversized.md'),
      Buffer.alloc(MAX_DECISION_BYTES + 1, 'a'),
    );

    const loaded = await loadDecisions(root);

    expect(loaded.records).toEqual([]);
    expect(loaded.issues).toEqual([
      expect.objectContaining({
        code: 'decision-file-too-large',
        file: 'docs/decisions/oversized.md',
      }),
    ]);
  });
});
