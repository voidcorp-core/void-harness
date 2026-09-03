import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countLines, estimateTokens, readFrontmatter } from './read-frontmatter.js';

/**
 * The parser reads two texts now: the SKILL.md, which carries only what the Agent
 * Skills specification defines, and the co-located `harness.yaml`, which carries
 * the fields this harness invented. Fixtures exercising a harness field are
 * therefore passed as the second argument; the markdown side only ever held
 * `description`.
 */

describe('readFrontmatter', () => {
  it('strips surrounding quotes from a valid-YAML quoted description (colon-carrying text)', () => {
    const md = '---\nname: dbg\ndescription: "Four phases: no fix without a test."\n---\nbody';
    expect(readFrontmatter(md).description).toBe('Four phases: no fix without a test.');
  });

  it('extracts the description field', () => {
    const md = '---\nname: tdd\ndescription: TDD with three modes.\n---\n\n# tdd\n';
    expect(readFrontmatter(md).description).toBe('TDD with three modes.');
  });
  it('extracts the resolved value of a folded YAML description', () => {
    const md = '---\nname: tdd\ndescription: >-\n  TDD with three\n  modes.\n---\n\n# tdd\n';
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
    expect(readFrontmatter('', md).triggers).toEqual({
      globs: ['**/*.test.ts', '**/*.spec.ts'],
      extensions: ['ts', 'tsx'],
      tools: ['Edit', 'Write'],
    });
  });

  it('keeps only the declared dimensions', () => {
    const md = '---\ndescription: x\ntriggers:\n  extensions: ["sql"]\n---\n';
    expect(readFrontmatter('', md).triggers).toEqual({ extensions: ['sql'] });
  });

  it('omits triggers entirely when absent', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').triggers).toBeUndefined();
  });

  it('is tolerant: a malformed array drops that dimension, never throws', () => {
    const md = '---\ndescription: x\ntriggers:\n  globs: [not json\n  tools: ["Bash"]\n---\n';
    expect(readFrontmatter('', md).triggers).toEqual({ tools: ['Bash'] });
  });

  it('drops non-string entries inside a dimension', () => {
    const md = '---\ndescription: x\ntriggers:\n  extensions: ["ts", 3, null]\n---\n';
    expect(readFrontmatter('', md).triggers).toEqual({ extensions: ['ts'] });
  });
});

describe('readFrontmatter — activation', () => {
  it('reads activation: always', () => {
    const md = '---\nname: tdd\ndescription: TDD.\nactivation: always\n---\nbody';
    expect(readFrontmatter('', md).activation).toBe('always');
  });

  it('reads activation: on-demand', () => {
    const md = '---\ndescription: x\nactivation: on-demand\n---\n';
    expect(readFrontmatter('', md).activation).toBe('on-demand');
  });

  it('omits activation when absent (default is on-demand at the consumer)', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').activation).toBeUndefined();
  });

  it('is tolerant: an unknown activation value is dropped, never throws', () => {
    const md = '---\ndescription: x\nactivation: sometimes\n---\n';
    expect(readFrontmatter('', md).activation).toBeUndefined();
  });
});

describe('readFrontmatter — owner', () => {
  it('reads the owner scalar', () => {
    const md = '---\nname: tdd\ndescription: TDD.\nowner: folpe\n---\nbody';
    expect(readFrontmatter('', md).owner).toBe('folpe');
  });

  it('omits owner when absent (governance flags it downstream)', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').owner).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(readFrontmatter('', '---\ndescription: x\nowner:   folpe  \n---\n').owner).toBe('folpe');
  });

  it('does not confuse a substring key (e.g. co-owner) with owner', () => {
    expect(readFrontmatter('', '---\ndescription: x\nco-owner: someone\n---\n').owner).toBeUndefined();
  });

  it('treats a quoted-empty owner as absent (fail-closed: a vacuous owner must not pass governance)', () => {
    expect(readFrontmatter('', '---\ndescription: x\nowner: ""\n---\n').owner).toBeUndefined();
    expect(readFrontmatter("---\ndescription: x\nowner: ''\n---\n").owner).toBeUndefined();
  });

  it('treats YAML null representations as absent', () => {
    for (const v of ['~', 'null', 'Null', 'NULL']) {
      expect(readFrontmatter(`---\ndescription: x\nowner: ${v}\n---\n`).owner).toBeUndefined();
    }
  });

  it('strips surrounding quotes from a real owner value', () => {
    expect(readFrontmatter('', '---\ndescription: x\nowner: "folpe"\n---\n').owner).toBe('folpe');
    expect(readFrontmatter('', "---\ndescription: x\nowner: 'folpe'\n---\n").owner).toBe('folpe');
  });

  it('only strips a MATCHED quote pair: a dangling or lone quote stays present, not silently cleaned', () => {
    expect(readFrontmatter('', '---\ndescription: x\nowner: "flo\n---\n').owner).toBe('"flo');
    expect(readFrontmatter('', '---\ndescription: x\nowner: "\n---\n').owner).toBe('"');
  });
});

describe('readFrontmatter — runtimes', () => {
  it('parses a bracketed runtimes list (unquoted or quoted, tolerant)', () => {
    expect(readFrontmatter('', '---\ndescription: x\nruntimes: [claude, codex]\n---\n').runtimes).toEqual(['claude', 'codex']);
    expect(readFrontmatter('', '---\ndescription: x\nruntimes: ["claude", "codex", "hermes"]\n---\n').runtimes).toEqual([
      'claude',
      'codex',
      'hermes',
    ]);
  });

  it('omits runtimes when absent or empty (governance flags absence)', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').runtimes).toBeUndefined();
    expect(readFrontmatter('', '---\ndescription: x\nruntimes: []\n---\n').runtimes).toBeUndefined();
  });

  it('parses the idiomatic multi-line YAML block list form (must not read as absent)', () => {
    const md = '---\ndescription: x\nruntimes:\n  - claude\n  - codex\n---\nbody';
    expect(readFrontmatter('', md).runtimes).toEqual(['claude', 'codex']);
  });

  it('tolerates a space-separated bracketed list', () => {
    expect(readFrontmatter('', '---\ndescription: x\nruntimes: [claude codex]\n---\n').runtimes).toEqual(['claude', 'codex']);
  });
});

describe('readFrontmatter — enforcement', () => {
  const full = [
    '---',
    'description: x',
    'enforcement:',
    '  floor: ci',
    '  inline:',
    '    claude: pretooluse',
    '    codex: pretooluse',
    '    hermes: ci-only',
    '---',
    'body',
  ].join('\n');

  it('parses the nested floor + per-runtime inline tiers', () => {
    expect(readFrontmatter('', full).enforcement).toEqual({
      floor: 'ci',
      inline: { claude: 'pretooluse', codex: 'pretooluse', hermes: 'ci-only' },
    });
  });

  it('parses a floor-only enforcement block', () => {
    const md = '---\ndescription: x\nenforcement:\n  floor: ci\n---\n';
    expect(readFrontmatter('', md).enforcement).toEqual({ floor: 'ci' });
  });

  it('omits enforcement when absent, and when floor is missing (floor is required)', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').enforcement).toBeUndefined();
    const noFloor = '---\ndescription: x\nenforcement:\n  inline:\n    claude: pretooluse\n---\n';
    expect(readFrontmatter(noFloor).enforcement).toBeUndefined();
  });

  it('accepts a case-variant floor value (ci), normalized', () => {
    const md = '---\ndescription: x\nenforcement:\n  floor: CI\n---\n';
    expect(readFrontmatter('', md).enforcement).toEqual({ floor: 'ci' });
  });

  it('drops an enforcement block whose floor is an invalid value (floor must be ci)', () => {
    const md = '---\ndescription: x\nenforcement:\n  floor: broken\n  inline:\n    claude: active\n---\n';
    expect(readFrontmatter('', md).enforcement).toBeUndefined();
  });

  it('is tolerant: an unknown inline tier is dropped, never throws', () => {
    const md = '---\ndescription: x\nenforcement:\n  floor: ci\n  inline:\n    claude: sometimes\n    codex: active\n---\n';
    expect(readFrontmatter('', md).enforcement).toEqual({ floor: 'ci', inline: { codex: 'active' } });
  });
});

describe('readFrontmatter — eval_targets', () => {
  it('parses slug-encoded runtime/provider/tier cells (flow or block form)', () => {
    const flow = '---\ndescription: x\neval_targets: [claude/anthropic/opus, codex/openai/gpt]\n---\n';
    expect(readFrontmatter('', flow).evalTargets).toEqual([
      { runtime: 'claude', provider: 'anthropic', tier: 'opus' },
      { runtime: 'codex', provider: 'openai', tier: 'gpt' },
    ]);
    const bloc = '---\ndescription: x\neval_targets:\n  - claude/anthropic/opus\n---\n';
    expect(readFrontmatter('', bloc).evalTargets).toEqual([{ runtime: 'claude', provider: 'anthropic', tier: 'opus' }]);
  });

  it('drops a malformed cell (not exactly runtime/provider/tier), never throws', () => {
    const md = '---\ndescription: x\neval_targets: [claude/anthropic/opus, broken, a/b]\n---\n';
    expect(readFrontmatter('', md).evalTargets).toEqual([{ runtime: 'claude', provider: 'anthropic', tier: 'opus' }]);
  });

  it('omits eval_targets when absent or empty', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').evalTargets).toBeUndefined();
    expect(readFrontmatter('', '---\ndescription: x\neval_targets: []\n---\n').evalTargets).toBeUndefined();
  });
});

describe('readFrontmatter — success_signal', () => {
  it('reads the success_signal scalar (a free-text sentence, quotes stripped)', () => {
    const md = '---\ndescription: x\nsuccess_signal: "test-first commit pair present"\n---\n';
    expect(readFrontmatter('', md).successSignal).toBe('test-first commit pair present');
  });

  it('omits success_signal when absent or vacuous', () => {
    expect(readFrontmatter('', '---\ndescription: x\n---\n').successSignal).toBeUndefined();
    expect(readFrontmatter('', '---\ndescription: x\nsuccess_signal: ""\n---\n').successSignal).toBeUndefined();
  });
});

describe('countLines', () => {
  it('counts newline-separated lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });

  // The definition, and the whole point of this function existing once. A text
  // file ends with a newline, and that trailing newline terminates the last
  // line rather than opening another. Splitting on it yields an empty final
  // element and counts one line too many -- which is how a 400-line skill
  // passed the pre-commit floor (`wc -l`) and failed the suite that same
  // afternoon, twice in one composition, the second time after the first guard
  // had explicitly approved the commit.
  it('does not count the terminator of the last line as a line', () => {
    expect(countLines('a\nb\nc\n')).toBe(3);
  });

  it('counts a last line nobody terminated', () => {
    expect(countLines('a\nb\nc')).toBe(3);
    expect(countLines('a')).toBe(1);
  });

  it('has no lines when there is no text', () => {
    expect(countLines('')).toBe(0);
  });

  // Both guards judge the same cap, so they must agree at the cap exactly.
  it('agrees with wc -l on a file of exactly 400 lines', () => {
    const text = `${Array.from({ length: 400 }, (_, index) => `line ${index + 1}`).join('\n')}\n`;
    const file = join(mkdtempSync(join(tmpdir(), 'count-lines-')), 'SKILL.md');
    writeFileSync(file, text);

    const wc = Number(execFileSync('wc', ['-l', file], { encoding: 'utf8' }).trim().split(/\s+/)[0]);

    expect(countLines(text)).toBe(400);
    expect(countLines(text)).toBe(wc);
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
