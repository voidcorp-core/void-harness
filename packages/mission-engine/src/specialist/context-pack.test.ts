import { describe, expect, it } from 'vitest';
import {
  compileContextPack,
  parseContextPackValue,
  type ContextPackInput,
} from './context-pack.js';

function input(overrides: Partial<ContextPackInput> = {}): ContextPackInput {
  return {
    diff: 'diff --git a/a.ts b/a.ts\n+const a = 1;\n',
    touchedPaths: ['a.ts'],
    artifacts: [],
    lens: 'full',
    budgetTokens: 12_000,
    ...overrides,
  };
}

describe('compileContextPack', () => {
  it('carries the diff and the touched paths a specialist would otherwise search for', () => {
    const pack = compileContextPack(input());

    expect(pack.diff).toContain('const a = 1;');
    expect(pack.touchedPaths).toEqual(['a.ts']);
    expect(pack.omitted).toEqual([]);
  });

  it('is deterministic, so the same inputs produce the same context id', () => {
    expect(compileContextPack(input()).contextId)
      .toBe(compileContextPack(input()).contextId);
  });

  it('gives a different context id to a different diff, so a reused context is detectable', () => {
    const one = compileContextPack(input());
    const other = compileContextPack(input({ diff: 'diff --git a/b.ts b/b.ts\n+const b = 2;\n' }));

    expect(one.contextId).not.toBe(other.contextId);
  });

  it('names what it dropped rather than truncating in silence', () => {
    const pack = compileContextPack(input({
      artifacts: [
        { path: 'kept.md', text: 'k'.repeat(400) },
        { path: 'dropped.md', text: 'd'.repeat(4_000) },
      ],
      budgetTokens: 200,
    }));

    expect(pack.omitted).toContain('dropped.md');
    expect(pack.artifacts.map((item) => item.path)).not.toContain('dropped.md');
  });

  it('keeps the diff when the budget is too small, because the diff is the subject', () => {
    const pack = compileContextPack(input({
      diff: 'diff --git a/a.ts b/a.ts\n'.repeat(200),
      artifacts: [{ path: 'note.md', text: 'n'.repeat(1_000) }],
      budgetTokens: 100,
    }));

    expect(pack.diff.length).toBeGreaterThan(0);
    expect(pack.omitted).toContain('note.md');
  });

  it('declares a truncated diff as a limitation, since a partial diff is not a diff', () => {
    const pack = compileContextPack(input({
      diff: 'x'.repeat(40_000),
      budgetTokens: 100,
    }));

    expect(pack.diffTruncated).toBe(true);
    expect(pack.omitted).toContain('diff (truncated)');
  });

  it('spends a smaller budget on a reduced lens, which is what makes the floor affordable', () => {
    const artifacts = [{ path: 'note.md', text: 'n'.repeat(8_000) }];
    const full = compileContextPack(input({ artifacts }));
    const reduced = compileContextPack(input({ artifacts, lens: 'reduced' }));

    expect(reduced.estimatedTokens).toBeLessThan(full.estimatedTokens);
  });

  it('carries what the compiler could not obtain, so an empty pack is never read as a clean one', () => {
    const pack = compileContextPack(input({ diff: '', unavailable: ['diff (git unavailable)'] }));

    expect(pack.omitted).toContain('diff (git unavailable)');
  });

  it('refuses a budget it cannot honour rather than emitting an unbounded pack', () => {
    expect(() => compileContextPack(input({ budgetTokens: 0 })))
      .toThrow(/CONTEXT_PACK_INVALID/);
    expect(() => compileContextPack(input({ budgetTokens: 1_000_000 })))
      .toThrow(/CONTEXT_PACK_INVALID/);
  });

  it('refuses a path it cannot attribute, so a pack never points outside the repository', () => {
    expect(() => compileContextPack(input({ touchedPaths: ['../secrets.env'] })))
      .toThrow(/CONTEXT_PACK_INVALID/);
    expect(() => compileContextPack(input({ touchedPaths: ['/etc/passwd'] })))
      .toThrow(/CONTEXT_PACK_INVALID/);
  });
});

describe('parseContextPackValue', () => {
  it('accepts a pack it compiled itself, so the contract survives the boundary', () => {
    const pack = compileContextPack(input({ artifacts: [{ path: 'a.md', text: 'hello' }] }));

    expect(parseContextPackValue(JSON.parse(JSON.stringify(pack)))).toEqual(pack);
  });

  it('refuses a pack whose id does not match its content, which is a tampered pack', () => {
    const pack = compileContextPack(input());

    expect(() => parseContextPackValue({ ...pack, diff: 'something else entirely' }))
      .toThrow(/CONTEXT_PACK_INVALID/);
  });

  it.each([
    ['not an object', 'a string'],
    ['a missing field', { schemaVersion: 1 }],
    ['an unknown field', { ...compileContextPack(input()), extra: 1 }],
    ['an absolute artifact path', {
      ...compileContextPack(input()),
      artifacts: [{ path: '/etc/passwd', text: 'x' }],
    }],
  ])('refuses %s', (_name, value) => {
    expect(() => parseContextPackValue(value)).toThrow(/CONTEXT_PACK_INVALID/);
  });
});
