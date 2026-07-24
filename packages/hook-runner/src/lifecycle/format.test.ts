import { describe, expect, it } from 'vitest';
import { formatCandidates } from './format.js';

describe('formatCandidates', () => {
  it('formats only explicitly touched supported files', () => {
    expect(formatCandidates([
      'src/user.ts',
      'scripts/migrate.py',
      'README.md',
      'src/theme.css',
    ], '/project')).toEqual([
      '/project/src/user.ts',
      '/project/src/theme.css',
    ]);
  });

  it('handles spaces and excludes lexical path escapes', () => {
    expect(formatCandidates([
      'src/with space.ts',
      '../outside.ts',
      '/elsewhere/absolute.ts',
    ], '/project with space')).toEqual([
      '/project with space/src/with space.ts',
    ]);
  });
});
