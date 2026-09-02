import { describe, expect, it } from 'vitest';
import { tddOrder, type TddOrderInput } from './tdd-order.js';

const input = (path: string, patch: Partial<TddOrderInput> = {}): TddOrderInput => ({
  edits: [{ path, addedContent: 'export const feature = true;' }],
  mode: 'auto',
  businessGlobs: ['apps/*/src/**'],
  spikeGlobs: ['apps/*/scripts/spike-*'],
  existingHeaders: {},
  siblingTests: new Set(),
  ...patch,
});

describe('tddOrder', () => {
  it.each([
    'apps/api/src/feature.ts',
    'apps/web/src/components/Card.tsx',
  ])('blocks backend and frontend production edits without a sibling test: %s', (path) => {
    expect(tddOrder(input(path)).allow).toBe(false);
  });

  it('allows a frontend edit when its sibling test already exists', () => {
    expect(tddOrder(input('apps/web/src/Card.tsx', {
      siblingTests: new Set(['apps/web/src/Card.test.tsx']),
    })).allow).toBe(true);
  });

  it('allows tests, docs, migrations and exploratory files', () => {
    expect(tddOrder(input('apps/web/src/Card.test.tsx')).allow).toBe(true);
    expect(tddOrder(input('docs/card.md')).allow).toBe(true);
    expect(tddOrder(input('apps/web/src/migrations/001.ts')).allow).toBe(true);
    expect(tddOrder(input('apps/web/src/Card.tsx', {
      existingHeaders: { 'apps/web/src/Card.tsx': '// tdd-mode: exploratory\n' },
    })).allow).toBe(true);
  });

  it.each([
    'apps/web/src/styles.css',
    'apps/web/src/icon.svg',
  ])('routes non-executable UI assets to UI verification instead of dummy sibling tests: %s', (path) => {
    expect(tddOrder(input(path)).allow).toBe(true);
  });

  it('warns without blocking in souple mode', () => {
    const verdict = tddOrder(input('apps/web/src/Card.tsx', { mode: 'souple' }));
    expect(verdict.allow).toBe(true);
    expect(verdict.code).toBe('TDD_SIBLING_TEST_WARNING');
  });
});

// A module whose every top-level statement re-exports carries no behaviour: the
// test one would write for it asserts that an export exists, which the compiler
// already proves. In one consumer 51 barrels out of 51 had no sibling test by
// convention, and the block pushed the edit out through `sed`, outside the
// traced tools. The property is one of the content, so a barrel that gains a
// line of logic is covered again.
const barrel = (path: string, existing: string, added = existing): TddOrderInput => ({
  edits: [{ path, addedContent: added }],
  mode: 'strict',
  businessGlobs: ['apps/*/src/**'],
  spikeGlobs: [],
  existingHeaders: { [path]: existing },
  siblingTests: new Set(),
});

describe('tddOrder and a module that only re-exports', () => {
  const path = 'apps/web/src/components/AttentionBanner/index.ts';

  it.each([
    ["export { AttentionBanner } from './AttentionBanner';\n"],
    ["export * from './AttentionBanner';\n"],
    ["export * as banner from './AttentionBanner';\n"],
    ['export {};\n'],
    ["export type { BannerProps } from './AttentionBanner';\n"],
    ["export { default as Banner } from './AttentionBanner';\n"],
    ["export {\n  AttentionBanner,\n  BannerSlot,\n} from './AttentionBanner';\n"],
  ])('edits without a sibling test: %s', (content) => {
    expect(tddOrder(barrel(path, content)).allow).toBe(true);
  });

  it('reads through a comment, a directive and a type-only import', () => {
    const content = [
      "'use client';",
      '// Public surface of the banner.',
      '/* Kept flat on purpose. */',
      "import type { ReactNode } from 'react';",
      "export { AttentionBanner } from './AttentionBanner';",
      '',
    ].join('\n');
    expect(tddOrder(barrel(path, content)).allow).toBe(true);
  });

  it('covers the same file again as soon as it carries one line of logic', () => {
    const content = [
      "export { AttentionBanner } from './AttentionBanner';",
      'export const BANNER_LIMIT = 3;',
      '',
    ].join('\n');
    expect(tddOrder(barrel(path, content)).allow).toBe(false);
  });

  it('blocks an edit whose fragment re-exports but whose file carries logic', () => {
    const existing = "export const compute = (value: number) => value * 2;\n";
    const added = "export { AttentionBanner } from './AttentionBanner';";
    expect(tddOrder(barrel(path, existing, added)).allow).toBe(false);
  });

  it('blocks an edit that adds logic to a barrel', () => {
    const existing = "export { AttentionBanner } from './AttentionBanner';\n";
    const added = 'export const BANNER_LIMIT = 3;';
    expect(tddOrder(barrel(path, existing, added)).allow).toBe(false);
  });

  it('does not mistake a comment marker inside a module specifier for a comment', () => {
    const content = "export { schema } from 'https://example.test/schema.ts';\n";
    expect(tddOrder(barrel(path, content)).allow).toBe(true);
  });

  it('blocks when an unterminated block comment makes the content undecidable', () => {
    const content = "/* export { AttentionBanner } from './AttentionBanner';\n";
    expect(tddOrder(barrel(path, content)).allow).toBe(false);
  });
});
