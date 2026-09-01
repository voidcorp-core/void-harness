/**
 * A failed install must not leave rules for files it never wrote.
 *
 * The ignore block enumerates the agents the receipt owns -- no pattern can tell
 * `doctrine-critic` from an agent the project wrote under the same name, so the
 * names are listed one by one. It was written before the file transaction and
 * outside its scope, so an install that failed afterwards left a repository
 * ignoring agent paths that are not on disk. An agent the project then wrote
 * under one of those names would be invisible to git, silently, at the first
 * clone: the exact loss the enumeration exists to prevent, reintroduced on the
 * failure path (DEV-665).
 *
 * The failure below is a real one, and it is the one that actually happens: a
 * managed file the first install owned, edited by hand, which the second
 * install refuses to overwrite. Nothing about the transaction is stubbed. Only
 * `process.exit` is, so the runner survives to read the repository afterwards --
 * the same treatment `doctor.test.ts` gives it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../../packages/cli/src/commands/init.js';

let dir: string;
let cwd: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-ignore-tx-'));
  cwd = process.cwd();
  process.chdir(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${String(code ?? 0)})`);
  }) as never);
});
afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const exclude = (): string => {
  try {
    return readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8');
  } catch {
    return '';
  }
};

/** Every agent path the block claims, whether or not it is on disk. */
function claimedAgentPaths(): readonly string[] {
  return exclude()
    .split('\n')
    .map((rule) => rule.trim())
    .filter((rule) => rule.startsWith('.claude/agents/') && rule.endsWith('.md'));
}

/** A second install that cannot commit: an owned file was edited by hand. */
async function failingSecondInstall(): Promise<void> {
  writeFileSync(join(dir, '.void', 'installed', 'PHILOSOPHY.md'), '# mine now\n');
  await expect(init(['--runtime', 'claude', '--no-interactive'])).rejects.toThrow(/process\.exit\(1\)/);
}

describe('the ignore block never outlives a transaction that failed', () => {
  it('claims no agent path the install did not write', async () => {
    await init(['--runtime', 'claude', '--no-interactive']);
    // The project cleared them out; whether it was right to is not the question.
    // What matters is that the failed install below does not claim them back.
    rmSync(join(dir, '.claude', 'agents'), { recursive: true, force: true });

    await failingSecondInstall();

    const absent = claimedAgentPaths().filter((path) => !existsSync(join(dir, ...path.split('/'))));
    expect(absent).toEqual([]);
  });

  // The reason the block was written before the transaction in the first place.
  // Trading a silent ignore for a `git clean` that carries off the install would
  // be a worse bargain than the defect.
  it('still hides what the harness generates, so a clean cannot take it', async () => {
    await init(['--runtime', 'claude', '--no-interactive']);

    await failingSecondInstall();

    expect(exclude()).toContain('.void/machine/');
  });

  it('claims every agent once the install did commit', async () => {
    await init(['--runtime', 'claude', '--no-interactive']);

    expect(exclude()).toContain('.claude/agents/doctrine-critic.md');
    expect(claimedAgentPaths().length).toBeGreaterThan(1);
  });
});
