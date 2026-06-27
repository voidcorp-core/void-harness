import { describe, expect, it } from 'vitest';
import { extractMeta } from './extract-meta.js';

describe('extractMeta', () => {
  it('reads phases (title + detail) from a meta literal', () => {
    const src = [
      "export const meta = {",
      "  name: 'demo',",
      "  description: 'd',",
      "  phases: [",
      "    { title: 'Scan', detail: 'grep logs' },",
      "    { title: 'Fix' },",
      "  ],",
      "};",
      "phase('Scan');",
      "const x = await agent('go');",
    ].join('\n');
    expect(extractMeta(src)).toEqual({ phases: [{ title: 'Scan', detail: 'grep logs' }, { title: 'Fix' }] });
  });

  it('returns empty phases when meta has none', () => {
    expect(extractMeta("export const meta = { name: 'x', description: 'y' };")).toEqual({ phases: [] });
  });

  it('returns empty phases when no meta is present', () => {
    expect(extractMeta('const notMeta = 1;')).toEqual({ phases: [] });
  });
});
