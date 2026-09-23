import { describe, expect, it } from 'vitest';
import { shellCommands, substitutionBodies } from './shell-words.js';

// The words a program receives, not the characters the command shows: quotes
// and escapes removed, expansions kept as written and marked dynamic.

const texts = (line: string): string[][] =>
  (shellCommands(line) ?? []).map((command) => command.words.map((word) => word.text));

describe('shellCommands', () => {
  it('removes quotes and escapes the way the shell does', () => {
    expect(texts(`gh api -f "a b" 'c d' e\\ f void/indep"end"ent`)).toEqual([
      ['gh', 'api', '-f', 'a b', 'c d', 'e f', 'void/independent'],
    ]);
  });

  it('marks a word that an expansion decides, and only that word', () => {
    const [command] = shellCommands(`x "$A" '$B' $(cat f) \`id\` $((1+2))d $'\\x2f' $`) ?? [];
    expect(command?.words.map((word) => [word.text, word.dynamic])).toEqual([
      ['x', false],
      ['$A', true],
      ['$B', false],
      ['$(cat f)', true],
      ['`id`', true],
      ['$((1+2))d', true],
      ["$'\\x2f'", true],
      ['$', false],
    ]);
  });

  it('splits simple commands on operators and keeps what feeds each one', () => {
    const commands = shellCommands('a 1 && b 2; c | d 2>&1 > out.txt < in.txt') ?? [];
    expect(commands.map((command) => command.words.map((word) => word.text))).toEqual([
      ['a', '1'], ['b', '2'], ['c'], ['d'],
    ]);
    expect(commands.map((command) => command.stdin.kind)).toEqual(['none', 'none', 'none', 'file']);
    expect(shellCommands('c | d')?.[1]?.stdin.kind).toBe('pipe');
  });

  it('reads a here-document as the input of its command, dynamic unless quoted', () => {
    const quoted = shellCommands("gh pr comment 1 -F - <<'EOF'\nhello $X\nEOF\necho done") ?? [];
    expect(quoted[0]?.stdin).toEqual({ kind: 'text', word: { text: 'hello $X', dynamic: false } });
    expect(quoted[1]?.words.map((word) => word.text)).toEqual(['echo', 'done']);
    const bare = shellCommands('cat <<EOF\nhello $X\nEOF') ?? [];
    expect(bare[0]?.stdin).toEqual({ kind: 'text', word: { text: 'hello $X', dynamic: true } });
  });

  it('keeps a command substitution in one word, whatever it contains', () => {
    expect(texts('echo "$(a | b; c)" next')).toEqual([['echo', '$(a | b; c)', 'next']]);
  });

  it('refuses a line too long to be an agent command', () => {
    expect(shellCommands('x'.repeat(256 * 1024 + 1))).toBeUndefined();
  });
});

describe('substitutionBodies', () => {
  it('returns what command, process and backtick substitutions run, outside single quotes', () => {
    const line = `x=$(gh pr view 1) "$(date)" \`id\` <(git diff) >(tee log) '$(hidden)'`;
    expect(substitutionBodies(line)).toEqual(['gh pr view 1', 'date', 'id', 'git diff', 'tee log']);
  });

  it('keeps a nested substitution whole, for the caller to read again', () => {
    expect(substitutionBodies('echo "$(a "$(b)" c)"')).toEqual(['a "$(b)" c']);
  });

  it('reads a process substitution as one word decided at run time', () => {
    const [command] = shellCommands('cat <(gh api x) file') ?? [];
    expect(command?.words.map((word) => word.dynamic)).toEqual([false, true, false]);
  });
});
