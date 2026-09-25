// @test-resource subprocess
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageManagerCommand } from '../../packages/cli/scripts/conformance-process.mjs';

const ROOT = resolve(__dirname, '../..');
const CLI = join(ROOT, 'packages/cli/bin/void-machine.mjs');
const hash = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
function put(root: string, path: string, body: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}
function tree(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => [join(entry.parentPath, entry.name), hash(readFileSync(join(entry.parentPath, entry.name)))]));
}
function run(cwd: string, cli = CLI, format = 'json') {
  return spawnSync(process.execPath, [cli, 'cheatsheet', '--format', format], {
    cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1' },
  });
}
function installed() {
  const root = mkdtempSync(join(tmpdir(), 'cheatsheet-consumer-'));
  const path = '.claude/skills/void-tdd/SKILL.md';
  const body = 'PRIVATE_CONSUMER_CANARY';
  put(root, path, body);
  put(root, '.void/config.json', JSON.stringify({ core: '3.7.1', packs: {} }));
  put(root, '.void/machine/receipts/install-v1.json', JSON.stringify({
    schemaVersion: 1, version: '3.7.1', source: 'local', runtimes: ['claude'],
    files: [{ path, sha256: hash(body), mode: 420 }],
  }));
  return root;
}

describe('installed cheatsheet consumer contract', () => {
  it('runs every format from the actual offline archive and refuses missing bundled specialists', () => {
    const root = mkdtempSync(join(tmpdir(), 'cheatsheet-packed-'));
    const npm = packageManagerCommand('npm');
    // npm's installed `pack --help` documents these flags. Build is a suite prerequisite;
    // ignore-scripts packs that candidate without rebuilding shared outputs during tests.
    const packed = spawnSync(npm.executable, [...npm.prefixArguments, 'pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', root], {
      cwd: join(ROOT, 'packages/cli'), encoding: 'utf8', timeout: 30000,
    });
    expect(packed.status, packed.stderr).toBe(0);
    const filename = JSON.parse(packed.stdout)[0].filename;
    const unpacked = spawnSync('tar', ['-xzf', join(root, filename), '-C', root], { encoding: 'utf8', timeout: 15000 });
    expect(unpacked.status, unpacked.stderr).toBe(0);
    const consumer = join(root, 'consumer');
    mkdirSync(consumer);
    const binary = join(root, 'package/bin/void-machine.mjs');
    const json = run(consumer, binary);
    expect(json.status, json.stderr).toBe(0);
    expect(JSON.parse(json.stdout).entries).toEqual(JSON.parse(run(consumer).stdout).entries);
    for (const format of ['html', 'markdown']) {
      const result = run(consumer, binary, format);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('void-tdd');
    }
    expect(readdirSync(consumer)).toEqual([]);
    renameSync(join(root, 'package/core-assets/specialists'), join(root, 'package/core-assets/specialists.saved'));
    const broken = run(consumer, binary);
    expect(broken.status).toBe(1);
    expect(broken.stdout).toBe('');
    expect(broken.stderr).toContain('CHEATSHEET_CATALOG_INVALID');
    expect(broken.stderr).not.toContain(root);
  }, 45000);
  it('finds the installation when invoked from a project subdirectory', () => {
    const root = installed();
    const nested = join(root, 'src', 'feature');
    mkdirSync(nested, { recursive: true });
    expect(JSON.parse(run(nested).stdout).installation).toBe('installed');
  });
  it('reads local off overrides without exporting private data or mutating the tree', () => {
    const root = installed();
    put(root, '.claude/settings.json', JSON.stringify({ skillOverrides: { 'void-tdd': 'off' }, canary: root }));
    const before = tree(root);
    const result = run(root);
    expect(result.status).toBe(0);
    const document = JSON.parse(result.stdout);
    expect(document.entries.find((entry: { id: string }) => entry.id === 'skill:void-tdd').availability[0].state).toBe('disabled');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_CONSUMER_CANARY');
    expect(result.stdout + result.stderr).not.toContain(root);
    expect(tree(root)).toEqual(before);
    put(root, '.void/config.json', '{invalid');
    expect(JSON.parse(run(root).stdout).installation).toBe('unknown');
  });

  it('uses the main installation from a real linked worktree', () => {
    const root = installed();
    const git = (args: string[]) => {
      const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    };
    git(['init', '-q']);
    git(['commit', '--allow-empty', '-m', 'test: establish worktree base']);
    const worktree = join(mkdtempSync(join(tmpdir(), 'cheatsheet-worktree-')), 'linked');
    git(['worktree', 'add', '--detach', worktree]);
    const before = tree(root);
    const result = run(worktree);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).installation).toBe('installed');
    expect(result.stdout).not.toContain(root);
    expect(tree(root)).toEqual(before);
  });
});
