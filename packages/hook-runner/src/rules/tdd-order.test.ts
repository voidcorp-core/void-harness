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

  it('warns without blocking in souple mode', () => {
    const verdict = tddOrder(input('apps/web/src/Card.tsx', { mode: 'souple' }));
    expect(verdict.allow).toBe(true);
    expect(verdict.code).toBe('TDD_SIBLING_TEST_WARNING');
  });
});
