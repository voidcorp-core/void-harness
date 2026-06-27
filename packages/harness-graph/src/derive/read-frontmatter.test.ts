import { describe, expect, it } from 'vitest';
import { countLines, readFrontmatter } from './read-frontmatter.js';

describe('readFrontmatter', () => {
  it('extracts the description field', () => {
    const md = '---\nname: tdd\ndescription: TDD with three modes.\n---\n\n# tdd\n';
    expect(readFrontmatter(md).description).toBe('TDD with three modes.');
  });
  it('returns empty description when absent', () => {
    expect(readFrontmatter('# no frontmatter\n').description).toBe('');
  });
});

describe('countLines', () => {
  it('counts newline-separated lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });
});
