import { describe, expect, it } from 'vitest';
import { loadFixture } from './fixture-loader.js';

describe('loadFixture', () => {
  it('loads only the explicitly enumerated committed files into a frozen record', () => {
    const fixture = loadFixture('ui/frontend-tdd', ['src/ActionMenu.tsx']);

    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.keys(fixture)).toEqual(['src/ActionMenu.tsx']);
    expect(fixture['src/ActionMenu.tsx']).toContain('ActionMenu');
  });

  it.each([
    ['directory traversal', '../src', ['cases.ts']],
    ['file traversal', 'ui/frontend-tdd', ['../../../src/cases.ts']],
    ['absolute directory', '/tmp', ['outside.ts']],
    ['Windows absolute directory', 'C:/outside', ['outside.ts']],
    ['duplicate file', 'ui/frontend-tdd', ['src/ActionMenu.tsx', 'src/ActionMenu.tsx']],
  ])('rejects %s before reading', (_label, directory, files) => {
    expect(() => loadFixture(directory, files)).toThrow(/FIXTURE_PATH_INVALID/);
  });
});
