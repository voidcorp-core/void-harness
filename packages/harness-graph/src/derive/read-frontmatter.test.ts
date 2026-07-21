import { describe, expect, it } from 'vitest';
import { countLines, estimateTokens, readFrontmatter } from './read-frontmatter.js';

describe('readFrontmatter', () => {
  it('extracts the description field', () => {
    const md = '---\nname: tdd\ndescription: TDD with three modes.\n---\n\n# tdd\n';
    expect(readFrontmatter(md).description).toBe('TDD with three modes.');
  });
  it('returns empty description when absent', () => {
    expect(readFrontmatter('# no frontmatter\n').description).toBe('');
  });

  it('parses a triggers block with globs / extensions / tools (inline JSON arrays)', () => {
    const md = [
      '---',
      'name: tdd',
      'description: TDD.',
      'triggers:',
      '  globs: ["**/*.test.ts", "**/*.spec.ts"]',
      '  extensions: ["ts", "tsx"]',
      '  tools: ["Edit", "Write"]',
      '---',
      'body',
    ].join('\n');
    expect(readFrontmatter(md).triggers).toEqual({
      globs: ['**/*.test.ts', '**/*.spec.ts'],
      extensions: ['ts', 'tsx'],
      tools: ['Edit', 'Write'],
    });
  });

  it('keeps only the declared dimensions', () => {
    const md = '---\ndescription: x\ntriggers:\n  extensions: ["sql"]\n---\n';
    expect(readFrontmatter(md).triggers).toEqual({ extensions: ['sql'] });
  });

  it('omits triggers entirely when absent', () => {
    expect(readFrontmatter('---\ndescription: x\n---\n').triggers).toBeUndefined();
  });

  it('is tolerant: a malformed array drops that dimension, never throws', () => {
    const md = '---\ndescription: x\ntriggers:\n  globs: [not json\n  tools: ["Bash"]\n---\n';
    expect(readFrontmatter(md).triggers).toEqual({ tools: ['Bash'] });
  });

  it('drops non-string entries inside a dimension', () => {
    const md = '---\ndescription: x\ntriggers:\n  extensions: ["ts", 3, null]\n---\n';
    expect(readFrontmatter(md).triggers).toEqual({ extensions: ['ts'] });
  });
});

describe('readFrontmatter — activation', () => {
  it('reads activation: always', () => {
    const md = '---\nname: tdd\ndescription: TDD.\nactivation: always\n---\nbody';
    expect(readFrontmatter(md).activation).toBe('always');
  });

  it('reads activation: on-demand', () => {
    const md = '---\ndescription: x\nactivation: on-demand\n---\n';
    expect(readFrontmatter(md).activation).toBe('on-demand');
  });

  it('omits activation when absent (default is on-demand at the consumer)', () => {
    expect(readFrontmatter('---\ndescription: x\n---\n').activation).toBeUndefined();
  });

  it('is tolerant: an unknown activation value is dropped, never throws', () => {
    const md = '---\ndescription: x\nactivation: sometimes\n---\n';
    expect(readFrontmatter(md).activation).toBeUndefined();
  });
});

describe('readFrontmatter — owner', () => {
  it('reads the owner scalar', () => {
    const md = '---\nname: tdd\ndescription: TDD.\nowner: folpe\n---\nbody';
    expect(readFrontmatter(md).owner).toBe('folpe');
  });

  it('omits owner when absent (governance flags it downstream)', () => {
    expect(readFrontmatter('---\ndescription: x\n---\n').owner).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(readFrontmatter('---\ndescription: x\nowner:   folpe  \n---\n').owner).toBe('folpe');
  });

  it('does not confuse a substring key (e.g. co-owner) with owner', () => {
    expect(readFrontmatter('---\ndescription: x\nco-owner: someone\n---\n').owner).toBeUndefined();
  });

  it('treats a quoted-empty owner as absent (fail-closed: a vacuous owner must not pass governance)', () => {
    expect(readFrontmatter('---\ndescription: x\nowner: ""\n---\n').owner).toBeUndefined();
    expect(readFrontmatter("---\ndescription: x\nowner: ''\n---\n").owner).toBeUndefined();
  });

  it('treats YAML null representations as absent', () => {
    for (const v of ['~', 'null', 'Null', 'NULL']) {
      expect(readFrontmatter(`---\ndescription: x\nowner: ${v}\n---\n`).owner).toBeUndefined();
    }
  });

  it('strips surrounding quotes from a real owner value', () => {
    expect(readFrontmatter('---\ndescription: x\nowner: "folpe"\n---\n').owner).toBe('folpe');
    expect(readFrontmatter("---\ndescription: x\nowner: 'folpe'\n---\n").owner).toBe('folpe');
  });
});

describe('countLines', () => {
  it('counts newline-separated lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });
});

describe('estimateTokens', () => {
  it('estimates ~chars/4, rounding up', () => {
    expect(estimateTokens('abcd')).toBe(1); // 4/4
    expect(estimateTokens('abcde')).toBe(2); // 5/4 -> ceil
  });
  it('is zero for empty source', () => {
    expect(estimateTokens('')).toBe(0);
  });
});
