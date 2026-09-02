import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_PLUGIN_NAME } from '../lib/packs.js';
import { check, type CheckRemote } from './check.js';

// `check` compares what `init` installed with the marketplace at HEAD. The
// pins and the installed doctrine are hidden from git by design, so a linked
// worktree carries none of them: read from the tree it ran in, `check` told a
// worker that the doctrine was missing and every plugin uninstalled, and its
// remedy was to install a second copy where git was told not to look.

const PHILOSOPHY = '# Philosophy\n\nSafety > Performance > Developer Experience.\n';
const INSTALLED_PIN = '3.5.0';
const MARKETPLACE_PIN = '3.6.0';
const scratch: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function directory(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function repository(): string {
  const root = directory('void-check-main-');
  git(root, 'init', '--quiet');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git(root, 'add', 'README.md');
  git(
    root,
    '-c', 'user.name=Void Test',
    '-c', 'user.email=void@example.test',
    'commit', '--quiet', '-m', 'test: seed',
  );
  return root;
}

function linkedWorktree(main: string): string {
  const path = join(directory('void-check-linked-'), 'DEV-000');
  git(main, 'worktree', 'add', '--quiet', path, '-b', 'worker/DEV-000');
  return path;
}

/** What `init` leaves behind and hides from git: the core pin and the installed doctrine. */
function install(root: string): void {
  mkdirSync(join(root, '.void', 'installed'), { recursive: true });
  writeFileSync(join(root, '.void', 'config.json'), JSON.stringify({ core: INSTALLED_PIN }));
  writeFileSync(join(root, '.void', 'installed', 'PHILOSOPHY.md'), PHILOSOPHY);
}

/** A marketplace one core release ahead of the install, with the same doctrine, answered without gh. */
function marketplaceAhead(): CheckRemote {
  return {
    fetchRemoteMarketplace: () => ({
      ok: true,
      value: { name: 'voidcorp', plugins: [{ name: CORE_PLUGIN_NAME }] },
    }),
    fetchPinnedPluginVersion: () => ({ ok: true, value: MARKETPLACE_PIN }),
    fetchRemotePhilosophy: () => ({ ok: true, value: PHILOSOPHY }),
  };
}

async function checkFrom(cwd: string): Promise<string> {
  let written = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    written += String(chunk);
    return true;
  });
  await check(['--doctrine'], { cwd, remote: marketplaceAhead() });
  return written;
}

describe('check from a linked worktree', () => {
  it('reads the pins and the installed doctrine of the main checkout', async () => {
    const main = repository();
    install(main);
    const linked = linkedWorktree(main);
    expect(existsSync(join(linked, '.void'))).toBe(false);

    const report = await checkFrom(linked);

    expect(report).toContain('update available');
    expect(report).toContain('in sync');
    expect(report).not.toContain('not installed');
    expect(report).not.toContain('missing locally');
  });

  it('prints from the worktree what it prints from the main checkout', async () => {
    const main = repository();
    install(main);
    const linked = linkedWorktree(main);

    const fromMain = await checkFrom(main);
    const fromWorktree = await checkFrom(linked);

    expect(fromWorktree).toBe(fromMain);
  });

  it('still reports the doctrine missing when nothing was installed anywhere', async () => {
    const main = repository();
    const linked = linkedWorktree(main);

    const report = await checkFrom(linked);

    expect(report).toContain('missing locally');
    expect(report).toContain('not installed');
  });
});

describe('check in the main checkout', () => {
  it('reads the install next to the code, as before', async () => {
    const main = repository();
    install(main);

    const report = await checkFrom(main);

    expect(report).toContain('update available');
    expect(report).toContain('in sync');
    expect(report).not.toContain('missing locally');
  });
});
