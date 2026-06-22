import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  type AutoMergeRisk,
  type MergeObservation,
  autoMergeGate,
  classifyMergeState,
  protectionGate,
  rebaseArgs,
  rebaseOnto,
  retargetArgs,
} from './auto-merge.js';
import type { ProtectionStatus } from './branch-protection.js';
import type { GitRun } from './worktree.js';

const lowRisk: AutoMergeRisk = {
  clusterId: 'c',
  fileCount: 3,
  touchesUi: false,
  touchesSecurity: false,
  touchesMigration: false,
  isStackRoot: false,
};

describe('autoMergeGate (UC2 risk gating)', () => {
  test('does not arm when auto-merge was not requested', () => {
    expect(autoMergeGate(lowRisk, false).arm).toBe(false);
  });
  test('arms for a small, non-sensitive, non-root cluster', () => {
    expect(autoMergeGate(lowRisk, true).arm).toBe(true);
  });
  test('never arms a stack root (a human merges the chain head)', () => {
    expect(autoMergeGate({ ...lowRisk, isStackRoot: true }, true).arm).toBe(false);
  });
  test('never arms a security-touching cluster', () => {
    expect(autoMergeGate({ ...lowRisk, touchesSecurity: true }, true).arm).toBe(false);
  });
  test('never arms a migration-touching cluster', () => {
    expect(autoMergeGate({ ...lowRisk, touchesMigration: true }, true).arm).toBe(false);
  });
  test('never arms a UI-touching cluster', () => {
    expect(autoMergeGate({ ...lowRisk, touchesUi: true }, true).arm).toBe(false);
  });
  test('never arms a diff above the file cap', () => {
    expect(autoMergeGate({ ...lowRisk, fileCount: 50 }, true, { maxFiles: 10 }).arm).toBe(false);
  });
});

describe('protectionGate (M2: unknown is fatal under auto-merge)', () => {
  const protected_: ProtectionStatus = { kind: 'protected' };
  const unprotected: ProtectionStatus = { kind: 'unprotected' };
  const unknown: ProtectionStatus = { kind: 'unknown', reason: '403' };

  test('protected always proceeds', () => {
    expect(protectionGate(protected_, true)).toEqual({ proceed: true, severity: 'ok' });
    expect(protectionGate(protected_, false)).toEqual({ proceed: true, severity: 'ok' });
  });
  test('unprotected is fatal regardless of auto-merge (the A1 boundary)', () => {
    expect(protectionGate(unprotected, false).proceed).toBe(false);
    expect(protectionGate(unprotected, true).proceed).toBe(false);
  });
  test('unknown is FATAL under auto-merge', () => {
    const g = protectionGate(unknown, true);
    expect(g.proceed).toBe(false);
    expect(g.severity).toBe('fatal');
  });
  test('unknown only warns without auto-merge', () => {
    const g = protectionGate(unknown, false);
    expect(g.proceed).toBe(true);
    expect(g.severity).toBe('warn');
  });
});

describe('classifyMergeState (M1: classify and block safely)', () => {
  const base: MergeObservation = {
    mergeable: 'clean',
    checks: 'pass',
    baseUpToDate: true,
    protection: 'protected',
  };

  test('clean + passing + up-to-date + protected → merge', () => {
    expect(classifyMergeState(base, true)).toEqual({ kind: 'merge' });
  });
  test('a conflict blocks for a human gate (never silent resolution)', () => {
    expect(classifyMergeState({ ...base, mergeable: 'conflict' }, true)).toEqual({
      kind: 'block',
      reason: 'merge conflict — human gate',
    });
  });
  test('failed checks block', () => {
    expect(classifyMergeState({ ...base, checks: 'fail' }, true).kind).toBe('block');
  });
  test('pending checks wait', () => {
    expect(classifyMergeState({ ...base, checks: 'pending' }, true)).toEqual({ kind: 'wait' });
  });
  test('a moved base (parent merged) needs a rebase', () => {
    expect(classifyMergeState({ ...base, baseUpToDate: false }, true)).toEqual({ kind: 'rebase' });
  });
  test('under auto-merge, unknown protection blocks (fatal)', () => {
    expect(classifyMergeState({ ...base, protection: 'unknown' }, true).kind).toBe('block');
  });
  test('without auto-merge, unknown protection does not block on its own', () => {
    expect(classifyMergeState({ ...base, protection: 'unknown' }, false)).toEqual({ kind: 'merge' });
  });
});

describe('rebase / retarget arg builders', () => {
  test('rebaseArgs rebases the current branch onto a ref', () => {
    expect(rebaseArgs('cluster/a')).toEqual(['rebase', 'cluster/a']);
  });
  test('retargetArgs points a PR at a new base', () => {
    expect(retargetArgs('123', 'develop')).toEqual(['pr', 'edit', '123', '--base', 'develop']);
  });
});

// The autoplan finding made concrete: a stacked child rebased after its base
// moved with a divergent change CONFLICTS — there is no conflict-free cascade.
// rebaseOnto must abort cleanly and report it (the caller then blocks for a human).
describe('rebaseOnto against real git (the cascade is not conflict-free)', () => {
  const realGit: GitRun = (args, cwd) => {
    const p = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
    return { ok: p.status === 0, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
  };
  const sh = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'rebase-repo-'));
    sh(['init', '-b', 'main'], repo);
    sh(['config', 'user.email', 'test@void.dev'], repo);
    sh(['config', 'user.name', 'Void Test'], repo);
    writeFileSync(join(repo, 'shared.txt'), 'L1\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'init'], repo);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('a divergent base move makes the child rebase conflict, and we abort cleanly', () => {
    // child edits L1 one way...
    sh(['switch', '-c', 'cluster/child'], repo);
    writeFileSync(join(repo, 'shared.txt'), 'L1-child\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'child'], repo);
    const childHead = sh(['rev-parse', 'cluster/child'], repo).stdout.trim();
    // ...main moves the SAME line another way (models the squashed parent landing).
    sh(['switch', 'main'], repo);
    writeFileSync(join(repo, 'shared.txt'), 'L1-main\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'main moved'], repo);

    sh(['switch', 'cluster/child'], repo);
    const res = rebaseOnto(realGit, 'main', repo);

    expect(res.clean).toBe(false);
    // aborted: no rebase in progress, branch head intact.
    expect(sh(['rev-parse', '--abbrev-ref', 'HEAD'], repo).stdout.trim()).toBe('cluster/child');
    expect(sh(['rev-parse', 'cluster/child'], repo).stdout.trim()).toBe(childHead);
    expect(sh(['status', '--porcelain'], repo).stdout.trim()).toBe('');
  });

  test('a disjoint base move rebases cleanly', () => {
    sh(['switch', '-c', 'cluster/child'], repo);
    writeFileSync(join(repo, 'child.txt'), 'child\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'child'], repo);
    sh(['switch', 'main'], repo);
    writeFileSync(join(repo, 'main.txt'), 'main\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'main moved'], repo);

    sh(['switch', 'cluster/child'], repo);
    expect(rebaseOnto(realGit, 'main', repo).clean).toBe(true);
  });
});
