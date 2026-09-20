// @test-resource subprocess
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAutopilotCommand } from '../../packages/cli/src/commands/autopilot.js';

const NOW = '2026-09-16T18:00:00.000Z';
const ENV = {
  ...process.env, GIT_AUTHOR_NAME: 'Worktree fixture', GIT_COMMITTER_NAME: 'Worktree fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
};
function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) throw new Error(`git ${args[0]}: ${result.stderr}`);
  return result.stdout;
}
function oracle(path: string) {
  return {
    head: git(path, 'rev-parse', 'HEAD'), index: git(path, 'ls-files', '--stage', '-z'),
    staged: git(path, 'diff', '--cached', '--binary'), unstaged: git(path, 'diff', '--binary'),
    tracked: readFileSync(join(path, 'tracked.txt')).toString('hex'),
    untracked: existsSync(join(path, 'untracked.bin')) ? readFileSync(join(path, 'untracked.bin')).toString('hex') : '',
    names: git(path, 'ls-files', '--others', '--exclude-standard', '-z'),
  };
}
function dirty(path: string) {
  writeFileSync(join(path, 'tracked.txt'), 'staged edit\n');
  git(path, 'add', 'tracked.txt');
  writeFileSync(join(path, 'tracked.txt'), 'staged edit\nunstaged edit\n');
  writeFileSync(join(path, 'untracked.bin'), Buffer.from([0, 1, 255, 42]));
}

function fixture(run: (f: { root: string; repo: string; old: string; branch: string; durable: string; sha: string }, evidence: Record<string, unknown>) => void) {
  // A fixture-specific explicit root leaves the runner's isolated HOME intact.
  const parent = process.env.VOID_WORKTREE_TEST_ROOT
    ?? join(dirname(realpathSync(process.cwd())), '.void-worktree-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = realpathSync(mkdtempSync(join(parent, '.void-owned-fixture-')));
  const repo = join(root, 'repository');
  const old = join(root, 'legacy-checkout');
  const branch = 'legacy/dépôt';
  // Quotes and shell metacharacters are intentional argv-boundary evidence.
  const durable = join(root, "durable space '$(touch SHOULD-NOT-EXIST);&");
  const evidence: Record<string, unknown> = { ownedFixture: root };
  try {
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'tracked.txt'), 'base\n');
    writeFileSync(join(repo, '.gitignore'), '.evidence/\n');
    git(repo, 'add', 'tracked.txt', '.gitignore');
    git(repo, 'commit', '-q', '-m', 'fixture base');
    const sha = git(repo, 'rev-parse', 'HEAD').trim();
    git(repo, 'worktree', 'add', '-b', branch, old, sha);
    run({ root, repo, old, branch, durable, sha }, evidence);
    evidence.result = 'passed';
  } catch (error) {
    evidence.result = 'failed';
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    // Synthetic fixture only. Preserve proof before reclaiming its owned files;
    // an evidence write failure leaves the fixture intact for inspection.
    const report = join(process.cwd(), '.void/machine', `${basename(root)}.json`);
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(report, `${JSON.stringify(evidence, undefined, 2)}\n`);
    rmSync(root, { recursive: true, force: true });
  }
}

type Fixture = Parameters<Parameters<typeof fixture>[0]>[0];
function observe(f: Fixture, bindings: Array<{ ticketId: string; branch: string }>) {
  const records = git(f.repo, 'worktree', 'list', '--porcelain', '-z').split('\0\0').filter(Boolean);
  const worktrees = records.map((record, index) => {
    const lines = record.split('\0');
    const path = lines.find((line) => line.startsWith('worktree '))?.slice(9);
    if (!path) throw new Error('fixture Git inventory missing path');
    const branch = lines.find((line) => line.startsWith('branch '))?.slice(7);
    return {
      path: realpathSync(path), ...(branch ? { branch } : {}),
      headSha: git(path, 'rev-parse', 'HEAD').trim(), exists: true, main: index === 0,
      locked: lines.some((line) => line.startsWith('locked')), hasSubmodules: existsSync(join(path, '.gitmodules')),
      dirty: git(path, 'status', '--porcelain', '--untracked-files=all').length > 0,
      localData: existsSync(join(path, '.evidence/proof.json')) ? 'preserve' : 'none',
    };
  });
  return {
    repository: { name: 'example', root: f.repo }, environment: { home: homedir(), voidWorktrees: f.durable },
    observedAt: NOW, caseSensitive: true, worktrees,
    branches: git(f.repo, 'for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads').trim().split('\n').map((line) => {
      const [branch, headSha] = line.split('\0');
      return { branch, headSha };
    }),
    destinations: bindings.map(({ branch }) => {
      const path = join(f.durable, 'example', ...branch.split('/'));
      return { path, canonicalPath: path, exists: existsSync(path) };
    }),
    temporaryRoots: [realpathSync(tmpdir())],
  };
}
function prepare(f: Fixture, bindings = [{ ticketId: 'DEV-1', branch: f.branch }]) {
  const request = {
    schemaVersion: 2, action: 'prepare', runId: 'later-run', clusterId: 'later-cluster',
    base: { branch: 'main', sha: f.sha }, tickets: bindings.map((entry) => entry.ticketId),
    footprints: bindings.map(({ ticketId }) => ({ id: ticketId, areas: [`src/${ticketId}`], highRisk: false, confidence: 1, touchesMigration: false })),
    clusterSize: bindings.length, planPath: 'docs/plans/p.md', specPath: 'docs/specs/s.md',
    ticketBranches: bindings, worktrees: observe(f, bindings),
  };
  return runAutopilotCommand(['orchestrate', '--json'], JSON.stringify(request), { root: f.repo, now: NOW });
}
function execute(repo: string, command: string[]) {
  const [binary, ...args] = command;
  if (!binary) throw new Error('empty fixture command');
  return spawnSync(binary, args, { cwd: repo, env: ENV, encoding: 'utf8', shell: false, timeout: 10_000 });
}

describe('emitted worktree argv on real Git', () => {
  it('preserves staged, unstaged, untracked and HEAD bytes through move, interrupted setup and resumed reuse', () => fixture((f, evidence) => {
    dirty(f.old);
    const before = oracle(f.old);
    const bindings = [{ ticketId: 'DEV-1', branch: f.branch }, { ticketId: 'DEV-2', branch: 'autopilot-worker/DEV-2' }];
    const response = prepare(f, bindings);
    expect(response.exitCode, response.stderr).toBe(0);
    const planned = JSON.parse(response.stdout);
    const first: string[][] = planned.setup.filter((step: { ticketId: string }) => step.ticketId === 'DEV-1').map((step: { command: string[] }) => step.command);
    // The caller creates no checkout itself: execute every exact planner argv
    // for the first assignment, then interrupt before the second assignment.
    for (const command of first) {
      const moved = execute(f.repo, command);
      expect(moved.status, moved.stderr).toBe(0);
    }
    const path = planned.plan.assignments[0].worktreePath;
    const afterMove = oracle(path);
    expect(afterMove).toEqual(before);
    const resumedResponse = prepare(f, bindings);
    expect(resumedResponse.exitCode, resumedResponse.stderr).toBe(0);
    const resumed = JSON.parse(resumedResponse.stdout);
    expect(resumed.dispositions[0].state).toBe('reuse');
    expect(resumed.setup.map((step: { ticketId: string }) => step.ticketId)).toEqual(['DEV-2']);
    const created = execute(f.repo, resumed.setup[0].command);
    expect(created.status, created.stderr).toBe(0);
    expect(oracle(path)).toEqual(before);
    expect(existsSync(join(f.repo, 'SHOULD-NOT-EXIST'))).toBe(false);
    evidence.before = before; evidence.afterMove = afterMove; evidence.afterReuse = oracle(path);
    evidence.commands = [first, resumed.setup[0].command];
  }));

  it('refuses race-time dirty removal without losing any state and preserves useful ignored data', () => fixture((f, evidence) => {
    const response = prepare(f);
    expect(response.exitCode, response.stderr).toBe(0);
    const prepared = JSON.parse(response.stdout);
    for (const step of prepared.setup) {
      const moved = execute(f.repo, step.command);
      expect(moved.status, moved.stderr).toBe(0);
    }
    const path = prepared.plan.assignments[0].worktreePath;
    const bindings = [{ ticketId: 'DEV-1', branch: f.branch }];
    const request = {
      schemaVersion: 2, action: 'cleanup', plan: prepared.plan,
      integration: { sha: f.sha, included: [{ ticketId: 'DEV-1', headSha: f.sha }], excludedTicketIds: [] },
      merge: { integrationSha: f.sha, mergeSha: f.sha, ticketIds: ['DEV-1'], observedAt: NOW },
      worktrees: observe(f, bindings), retainedTicketIds: [],
    };
    mkdirSync(join(path, '.evidence'));
    writeFileSync(join(path, '.evidence/proof.json'), '{"useful":"ignored proof"}');
    const held = runAutopilotCommand(['orchestrate', '--json'], JSON.stringify({ ...request, worktrees: observe(f, bindings) }), { root: f.repo, now: NOW });
    expect(held.exitCode, held.stderr).toBe(0);
    expect(JSON.parse(held.stdout).teardown).toEqual([]);
    expect(JSON.parse(held.stdout).dispositions[0].reason).toMatch(/local data/);
    const archive = join(f.root, 'archived-proof.json');
    copyFileSync(join(path, '.evidence/proof.json'), archive);
    expect(readFileSync(archive)).toEqual(readFileSync(join(path, '.evidence/proof.json')));
    const archived = observe(f, bindings);
    archived.worktrees = archived.worktrees.map((entry) => ({ ...entry, localData: entry.path === path ? 'archived' : entry.localData }));
    const plannedResponse = runAutopilotCommand(['orchestrate', '--json'], JSON.stringify({ ...request, worktrees: archived }), { root: f.repo, now: NOW });
    expect(plannedResponse.exitCode, plannedResponse.stderr).toBe(0);
    dirty(path);
    const before = oracle(path);
    const command = JSON.parse(plannedResponse.stdout).teardown[0].command;
    const removed = execute(f.repo, command);
    expect(removed.status).not.toBe(0);
    expect(oracle(path)).toEqual(before);
    evidence.archivedProof = readFileSync(archive, 'utf8');
    expect(readFileSync(join(path, '.evidence/proof.json'), 'utf8')).toBe(evidence.archivedProof);
    evidence.command = command; evidence.stderr = removed.stderr; evidence.before = before; evidence.after = oracle(path);
  }));

  it('refuses main and locked moves without a recreate or force fallback', () => fixture((f, evidence) => {
    const main = prepare(f, [{ ticketId: 'DEV-1', branch: 'main' }]);
    expect(main.exitCode).toBe(2); expect(main.stdout).toBe('');
    expect(JSON.parse(main.stderr).error.cause).toMatch(/cannot move main checkout/);
    git(f.repo, 'worktree', 'lock', f.old);
    const before = oracle(f.old);
    const locked = prepare(f);
    expect(locked.exitCode).toBe(2); expect(locked.stdout).toBe('');
    expect(JSON.parse(locked.stderr).error.cause).toMatch(/cannot move locked checkout/);
    const actual = execute(f.repo, ['git', 'worktree', 'move', f.old, join(f.durable, 'locked')]);
    expect(actual.status).not.toBe(0);
    expect(oracle(f.old)).toEqual(before);
    evidence.main = main.stderr; evidence.locked = locked.stderr; evidence.actualRefusal = actual.stderr;
  }));
  it('refuses a real submodule-containing checkout in the planner and Git, without fallback', () => fixture((f, evidence) => {
    const module = join(f.root, 'module');
    mkdirSync(module);
    git(module, 'init', '-q', '-b', 'main');
    writeFileSync(join(module, 'module.txt'), 'module fixture\n');
    git(module, 'add', 'module.txt');
    git(module, 'commit', '-q', '-m', 'module base');
    git(f.old, '-c', 'protocol.file.allow=always', 'submodule', 'add', module, 'module');
    const before = oracle(f.old);
    const planned = prepare(f);
    expect(planned.exitCode).toBe(2); expect(planned.stdout).toBe('');
    expect(JSON.parse(planned.stderr).error.cause).toMatch(/cannot move checkout containing submodules/);
    const actual = execute(f.repo, ['git', 'worktree', 'move', f.old, join(f.durable, 'submodules')]);
    expect(actual.status).not.toBe(0);
    expect(oracle(f.old)).toEqual(before);
    expect(readFileSync(join(f.old, 'module/module.txt'), 'utf8')).toBe('module fixture\n');
    evidence.before = before; evidence.after = oracle(f.old); evidence.actualRefusal = actual.stderr;
  }));

});
