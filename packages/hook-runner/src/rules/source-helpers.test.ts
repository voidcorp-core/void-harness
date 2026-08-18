import { describe, expect, it } from 'vitest';
import { isGeneratedPath, isTestPath, lineEvidence } from './source-helpers.js';

const edit = (path: string, addedContent: string) => [{ path, addedContent }];

describe('lineEvidence', () => {
  it('reports the file and the one-based line of each offending line', () => {
    const evidence = lineEvidence(edit('src/a.ts', 'ok\nbad\nok\nbad'), () => true, (line) => line === 'bad');
    expect(evidence).toEqual(['src/a.ts:2', 'src/a.ts:4']);
  });

  it('says nothing about a file the rule does not apply to', () => {
    expect(lineEvidence(edit('src/a.py', 'bad'), (path) => path.endsWith('.ts'), () => true)).toEqual([]);
  });

  it('skips a line carrying the documented exception tag', () => {
    const edits = edit('src/a.ts', 'bad\nbad // allow-x: on purpose');
    expect(lineEvidence(edits, () => true, () => true, 'allow-x:')).toEqual(['src/a.ts:1']);
  });

  // The path travels with the line because some exemptions are per file type:
  // `return null` is what React requires of a .tsx and is not owed to a .ts.
  // Without it every rule had to decide from the line alone, which cannot see
  // which file it came from.
  it('hands the path to the predicate, so an exemption can depend on the file type', () => {
    const seen: string[] = [];
    lineEvidence(
      [{ path: 'src/Badge.tsx', addedContent: 'x' }, { path: 'src/user.ts', addedContent: 'x' }],
      () => true,
      (_line, path) => {
        seen.push(path);
        return false;
      },
    );
    expect(seen).toEqual(['src/Badge.tsx', 'src/user.ts']);
  });

  it('normalises a windows path before reporting it', () => {
    expect(lineEvidence(edit('src\\a.ts', 'bad'), () => true, () => true)).toEqual(['src/a.ts:1']);
  });
});

describe('path predicates', () => {
  it('recognises a test file by either convention', () => {
    expect(isTestPath('src/a.test.ts')).toBe(true);
    expect(isTestPath('src/a.ts')).toBe(false);
  });

  it('recognises generated and fixture trees', () => {
    expect(isGeneratedPath('src/__generated__/a.ts')).toBe(true);
    expect(isGeneratedPath('src/__fixtures__/a.ts')).toBe(true);
    expect(isGeneratedPath('src/a.ts')).toBe(false);
  });
});
