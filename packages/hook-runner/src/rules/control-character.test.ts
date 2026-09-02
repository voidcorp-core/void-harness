import { describe, expect, it } from 'vitest';
import { controlCharacter } from './control-character.js';

const edit = (path: string, addedContent: string) => [{ path, addedContent }];
const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(0x7f);
const BEL = String.fromCharCode(7);

describe('controlCharacter', () => {
  it('refuses a NUL byte in a TypeScript file, which is how two reached committed source', () => {
    const verdict = controlCharacter(edit('src/key.ts', `const k = \`a${NUL}b\`;`));
    expect(verdict.allow).toBe(false);
    expect(verdict.code).toBe('CONTROL_CHARACTER_IN_SOURCE');
  });

  it('names the byte and where it is, because the eye cannot find it', () => {
    const verdict = controlCharacter(edit('src/key.ts', `ok\nconst k = 'a${NUL}b';`));
    expect(verdict.evidence[0]).toBe('src/key.ts:2:13 U+0000');
  });

  it('lets tab, newline and carriage return through, which every source file has', () => {
    expect(controlCharacter(edit('src/a.ts', 'a\tb\r\nc\n')).allow).toBe(true);
  });

  it('refuses the other control points and DEL, the whole class rather than the one seen', () => {
    expect(controlCharacter(edit('src/a.ts', `x${BEL}`)).allow).toBe(false);
    expect(controlCharacter(edit('src/a.ts', `x${DEL}`)).allow).toBe(false);
  });

  it('leaves a file outside the source extensions alone', () => {
    expect(controlCharacter(edit('assets/logo.png', `PNG${NUL}`)).allow).toBe(true);
    expect(controlCharacter(edit('fixtures/blob.bin', `x${NUL}`)).allow).toBe(true);
  });

  it('covers every source extension the harness writes, not just TypeScript', () => {
    for (const path of ['a.ts', 'a.tsx', 'a.js', 'a.mjs', 'a.json', 'a.md', 'a.yaml', 'a.sh']) {
      expect(controlCharacter(edit(path, `x${NUL}`)).allow, path).toBe(false);
    }
  });

  it('tells the reader to build the byte rather than type it, which is the fix that held', () => {
    const verdict = controlCharacter(edit('src/a.test.ts', `x${NUL}`));
    expect(verdict.message).toContain('String.fromCharCode');
  });

  // The evidence is what the operator reads first, and a file full of them would
  // bury the remedy under a hundred identical lines.
  it('caps the evidence rather than printing every occurrence', () => {
    const verdict = controlCharacter(edit('src/a.ts', `${NUL}\n`.repeat(40)));
    expect(verdict.evidence.length).toBeLessThanOrEqual(6);
  });

  it('reports each offending path, so one bad file does not hide the next', () => {
    const verdict = controlCharacter([
      { path: 'src/a.ts', addedContent: `x${NUL}` },
      { path: 'src/b.ts', addedContent: `y${NUL}` },
    ]);
    expect(verdict.evidence.join(' ')).toContain('src/a.ts');
    expect(verdict.evidence.join(' ')).toContain('src/b.ts');
  });
});
