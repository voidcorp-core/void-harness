import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const projectId = 'e17b2f59-54b2-46aa-bb69-0c21434819f3';
const source = resolve(import.meta.dirname, '../..');
it('runs only from the private source workspace and publishes offline from an explicit export', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'backlog-cli-'));
  mkdirSync(join(root, 'scripts'));
  cpSync(join(source, 'scripts/backlog-index'), join(root, 'scripts/backlog-index'), { recursive: true });
  cpSync(join(source, 'scripts/backlog-index.mjs'), join(root, 'scripts/backlog-index.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'void-harness', private: true }));
  const input = join(root, 'export.json');
  writeFileSync(input, JSON.stringify({ schemaVersion: 1, projectId, mode: 'full',
    capturedAt: '2026-09-12T12:00:00Z', issues: [], removals: [],
    coverage: { issuesComplete: true, commentsComplete: true, unfiltered: true } }));
  const script = join(root, 'scripts/backlog-index.mjs');
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  expect(run('--input', input, '--check').status).toBe(0);
  const output = join(root, '.void/machine/linear-index/INDEX.md');
  expect(existsSync(output)).toBe(false);
  const success = run('--input', input);
  expect(success.status, success.stderr).toBe(0);
  expect(success.stdout).toContain('0 tickets');
  const before = readFileSync(output, 'utf8');
  writeFileSync(input, '{');
  expect(run('--input', input).status).toBe(1);
  expect(readFileSync(output, 'utf8')).toBe(before);
  const fifo = join(root, 'input-pipe');
  if (process.platform !== 'win32') {
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
    const refused = spawnSync(process.execPath, [script, '--input', fifo], { cwd: root, encoding: 'utf8', timeout: 1500 });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('regular');
    symlinkSync(input, join(root, 'symlink.json'));
    expect(run('--input', join(root, 'symlink.json')).status).toBe(1);
  }
  expect(run('--wat').status).toBe(1);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  expect(run('--input', input).stderr).toContain('source workspace');
  const foreign = spawnSync(process.execPath, [script, '--input', input], { cwd: tmpdir(), encoding: 'utf8' });
  expect(foreign.status).toBe(1);
});

it('ignores the source index and exchange files in a fresh clone without private excludes', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'backlog-ignore-'));
  cpSync(join(source, '.gitignore'), join(root, '.gitignore'));
  mkdirSync(join(root, '.void'));
  cpSync(join(source, '.void/.gitignore'), join(root, '.void/.gitignore'));
  expect(spawnSync('git', ['init', '-q', root]).status).toBe(0);
  for (const file of ['.void/machine/linear-index/INDEX.md', '.void/machine/linear-export.json']) {
    const result = spawnSync('git', ['-c', 'core.excludesFile=/dev/null', 'check-ignore', file], { cwd: root, encoding: 'utf8' });
    expect(result.status, file).toBe(0);
  }
});
