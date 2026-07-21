/**
 * Tests for scripts/build-decisions-index.mjs — the generator that rebuilds
 * docs/DECISIONS.md from docs/decisions-log/. parse()/buildIndex() are the
 * load-bearing logic; the real-repo test proves the committed index is in sync.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script, no types
import { parse, buildIndex } from '../../scripts/build-decisions-index.mjs';

describe('parse', () => {
  it('extracts the date from frontmatter and returns the body verbatim', () => {
    const { date, body } = parse('---\ndate: 2026-07-21\ntitle: "x"\n---\n\n## 2026-07-21: x\n\nprose');
    expect(date).toBe('2026-07-21');
    expect(body).toBe('## 2026-07-21: x\n\nprose');
  });
});

describe('buildIndex', () => {
  it('orders entries newest date first, tiebreak by filename DESC', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dl-'));
    const write = (f: string, date: string, h: string) =>
      writeFileSync(join(dir, f), `---\ndate: ${date}\ntitle: "${h}"\n---\n\n## ${date}: ${h}\n`);
    write('2026-07-10-a.md', '2026-07-10', 'a');
    write('2026-07-10-b.md', '2026-07-10', 'b');
    write('2026-06-01-old.md', '2026-06-01', 'old');
    const { text, count } = buildIndex(dir);
    expect(count).toBe(3);
    // Newest date first; within the same date, filename DESC (b before a).
    const order = [...text.matchAll(/^## (\d{4}-\d{2}-\d{2}): (\w+)/gm)].map((m) => m[2]);
    expect(order).toEqual(['b', 'a', 'old']);
  });
});

describe('real repo', () => {
  it('the committed docs/DECISIONS.md is in sync with docs/decisions-log/', () => {
    const root = resolve(process.cwd());
    const { text, count } = buildIndex(join(root, 'docs/decisions-log'));
    expect(count).toBeGreaterThan(50);
    // Must match byte-for-byte, or `pnpm decisions:check` would fail in CI.
    expect(readFileSync(join(root, 'docs/DECISIONS.md'), 'utf8')).toBe(text);
  });
});
