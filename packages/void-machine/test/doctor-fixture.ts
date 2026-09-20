import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { onTestFinished } from 'vitest';

const project = resolve(import.meta.dirname, '../../..');
const entry = resolve(project, process.env['VOID_MACHINE_CONTRACT_ENTRY']
  ?? 'packages/void-machine/dist/application/cli.js');

export function doctorFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'machine-doctor-')));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const repository = join(root, 'repo');
  const home = join(root, 'home');
  mkdirSync(home);
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'] ?? '',
    SystemRoot: process.env['SystemRoot'],
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: devNull,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    ...(process.env['VOID_MACHINE_BIN'] === undefined ? {} : {
      VOID_MACHINE_BIN: process.env['VOID_MACHINE_BIN'],
    }),
  };
  const git = (args: readonly string[], cwd = root) => execFileSync('git', [...args], {
    cwd, env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git(['init', '--quiet', repository]);
  mkdirSync(join(repository, '.void'));
  const invoke = (args: readonly string[], cwd = repository, extra: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(process.execPath, [entry, ...args], {
      cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 5000,
      maxBuffer: 1024 * 1024, windowsHide: true,
    });
    if (result.error) throw result.error;
    return result;
  };
  return { root, repository, home, git, invoke };
}

export function contentsDigest(root: string): string {
  const hash = createHash('sha256');
  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      const file = join(path, entry.name);
      hash.update(file);
      if (entry.isDirectory()) visit(file);
      else hash.update(readFileSync(file));
    }
  }
  visit(root);
  return hash.digest('hex');
}
