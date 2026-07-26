import { describe, expect, it } from 'vitest';
import {
  assessLargeChange,
  hasLargeChangeJustification,
  parseAddedLines,
} from './large-change.js';

describe('parseAddedLines', () => {
  it('sums text additions and ignores binary entries', () => {
    expect(parseAddedLines([
      '12\t3\tsrc/a.ts',
      '-\t-\tpublic/image.png',
      '8\t0\tsrc/path with spaces.ts',
    ].join('\n'))).toBe(20);
  });
});

describe('hasLargeChangeJustification', () => {
  it('recognizes the marker in commit messages without depending on a PR provider', () => {
    expect(hasLargeChangeJustification(
      'feat: ship slice\n\nLarge-CL-Justification: atomic schema transition',
    )).toBe(true);
  });
});

describe('assessLargeChange', () => {
  it('allows changes below the configured threshold', () => {
    expect(assessLargeChange({
      addedLines: 399,
      threshold: 400,
      justified: false,
    })).toMatchObject({ allow: true, code: 'ALLOW' });
  });

  it('allows an explicitly justified atomic change', () => {
    expect(assessLargeChange({
      addedLines: 401,
      threshold: 400,
      justified: true,
    })).toMatchObject({ allow: true, code: 'ALLOW' });
  });

  it('warns without blocking when a large change lacks justification', () => {
    expect(assessLargeChange({
      addedLines: 401,
      threshold: 400,
      justified: false,
    })).toEqual({
      allow: true,
      code: 'LARGE_CHANGE_WARNING',
      message: 'change adds 401 lines (threshold 400); split it or justify why it is atomic',
      evidence: ['large-cl-justification: <reason>'],
    });
  });
});
