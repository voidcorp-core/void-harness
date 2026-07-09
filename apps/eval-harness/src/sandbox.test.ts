import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectFiles, commitIfMoved, git, resetSandbox, setupSandbox } from './sandbox.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const track = (r: { dir: string; baseSha: string }): { dir: string; baseSha: string } => (dirs.push(r.dir), r);

describe('setupSandbox', () => {
  it('materializes the fixture into a git repo with an initial commit', () => {
    const { dir, baseSha } = track(setupSandbox({ 'src/a.ts': 'export const a = 1;\n', 'README.md': '# x\n' }));
    expect(baseSha).toMatch(/^[0-9a-f]{7,}/);
    expect(collectFiles(dir)).toMatchObject({ 'src/a.ts': 'export const a = 1;\n', 'README.md': '# x\n' });
  });
});

describe('collectFiles', () => {
  it('walks nested files and skips .git and node_modules', () => {
    const { dir } = track(setupSandbox({ 'src/deep/x.ts': 'x' }));
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'ignored');
    const files = collectFiles(dir);
    expect(files['src/deep/x.ts']).toBe('x');
    expect(Object.keys(files).some((p) => p.includes('node_modules'))).toBe(false);
    expect(Object.keys(files).some((p) => p.startsWith('.git'))).toBe(false);
  });

  it('does not throw on a symlink-to-directory (it is skipped, not read as a file)', () => {
    const { dir } = track(setupSandbox({ 'real/keep.ts': 'k' }));
    symlinkSync(join(dir, 'real'), join(dir, 'link'), 'dir');
    expect(() => collectFiles(dir)).not.toThrow();
    expect(collectFiles(dir)['real/keep.ts']).toBe('k');
  });
});

describe('commitIfMoved', () => {
  it('returns undefined when HEAD has not moved past the fixture commit', () => {
    const { dir, baseSha } = track(setupSandbox({ 'a.txt': '1' }));
    expect(commitIfMoved(dir, baseSha)).toBeUndefined();
  });

  it('parses the subject and body when a new commit was made', () => {
    const { dir, baseSha } = track(setupSandbox({ 'a.txt': '1' }));
    writeFileSync(join(dir, 'a.txt'), '2');
    git(dir, 'commit', '-qam', 'feat(x): bump\n\nBecause the value changed.');
    expect(commitIfMoved(dir, baseSha)).toEqual({ subject: 'feat(x): bump', body: 'Because the value changed.' });
  });
});

describe('resetSandbox', () => {
  it('restores the sandbox to its base commit', () => {
    const { dir, baseSha } = track(setupSandbox({ 'a.txt': '1' }));
    writeFileSync(join(dir, 'a.txt'), 'changed');
    writeFileSync(join(dir, 'new.txt'), 'untracked');
    git(dir, 'commit', '-qam', 'wip');
    resetSandbox(dir, baseSha);
    expect(git(dir, 'rev-parse', 'HEAD').trim()).toBe(baseSha);
    expect(collectFiles(dir)).toEqual({ 'a.txt': '1' });
  });
});
