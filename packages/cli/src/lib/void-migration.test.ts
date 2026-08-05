import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateVoidLayout, planVoidMigration } from './void-migration.js';

const temporary: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'void-migration-'));
  temporary.push(root);
  mkdirSync(join(root, '.void'), { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, ...path.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrateVoidLayout', () => {
  it('moves observed state and leaves declared state exactly where it was', async () => {
    const root = project({
      '.void/activations.jsonl': 'a\n',
      '.void/runs/mis_1/events.jsonl': 'e\n',
      '.void/config.json': '{"packs":{}}',
      '.void/PROJECT-DOCTRINE.md': '# rules',
    });

    const result = await migrateVoidLayout(root);

    expect([...result.moved].sort()).toEqual(['activations.jsonl', 'runs']);
    expect(readFileSync(join(root, '.void/local/activations.jsonl'), 'utf8')).toBe('a\n');
    expect(readFileSync(join(root, '.void/local/runs/mis_1/events.jsonl'), 'utf8')).toBe('e\n');
    // The whole point: these two must still be where git and the hooks expect.
    expect(readFileSync(join(root, '.void/config.json'), 'utf8')).toBe('{"packs":{}}');
    expect(existsSync(join(root, '.void/PROJECT-DOCTRINE.md'))).toBe(true);
  });

  it('is idempotent — a second run has nothing left to do', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });
    await migrateVoidLayout(root);

    const second = await migrateVoidLayout(root);

    expect(second.moved).toEqual([]);
    expect(second.gitignoreTouched).toBe(false);
  });

  it('never overwrites a destination that already holds data', async () => {
    // Both halves populated means a half-finished migration or a concurrent
    // session. Losing the run journal a reconciliation is reading is worse than
    // leaving the old path in place, which every reader still falls back to.
    const root = project({
      '.void/activations.jsonl': 'old\n',
      '.void/local/activations.jsonl': 'new\n',
    });

    const result = await migrateVoidLayout(root);

    expect(result.conflicts).toEqual(['activations.jsonl']);
    expect(result.moved).toEqual([]);
    expect(readFileSync(join(root, '.void/local/activations.jsonl'), 'utf8')).toBe('new\n');
    expect(readFileSync(join(root, '.void/activations.jsonl'), 'utf8')).toBe('old\n');
  });

  it('writes the ignore block, preserving the rules the project already had', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });
    writeFileSync(join(root, '.gitignore'), 'node_modules\ndist/\n');

    const result = await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(result.gitignoreTouched).toBe(true);
    expect(ignore).toContain('node_modules');
    expect(ignore).toContain('dist/');
    expect(ignore).toContain('.void/local/');
  });

  it('replaces the improvised rule that started this, instead of stacking on it', async () => {
    // The block is marked, so a later run refreshes it in place. The hand-written
    // `.void/*` + `!` pair above it is the project's own text and is preserved —
    // reported, not silently rewritten.
    const root = project({ '.void/activations.jsonl': 'a\n' });
    writeFileSync(join(root, '.gitignore'), '.void/*\n!.void/PROJECT-DOCTRINE.md\n');

    await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(ignore).toContain('.void/local/');
    expect(ignore.match(/void-harness:begin/g)).toHaveLength(1);
  });

  it('writes nothing in dry-run, while answering exactly what it would do', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });

    const result = await migrateVoidLayout(root, true);

    expect(result.moved).toEqual(['activations.jsonl']);
    expect(result.gitignoreTouched).toBe(true);
    expect(existsSync(join(root, '.void/local/activations.jsonl'))).toBe(false);
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });

  it('does nothing at all in a project the harness never touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-migration-bare-'));
    temporary.push(root);

    const result = await migrateVoidLayout(root);

    expect(result).toEqual({ moved: [], conflicts: [], gitignoreTouched: false });
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });
});

describe('planVoidMigration', () => {
  it('separates what can move from what would collide', () => {
    const root = project({
      '.void/runs/mis_1/events.jsonl': 'e\n',
      '.void/activations.jsonl': 'old\n',
      '.void/local/activations.jsonl': 'new\n',
    });

    expect(planVoidMigration(root)).toEqual({ movable: ['runs'], conflicts: ['activations.jsonl'] });
  });
});
