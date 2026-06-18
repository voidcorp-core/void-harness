import { describe, expect, it } from 'vitest';
import {
  branchFromEvents,
  type IntegrateRun,
  integrateTicket,
  mergeArgs,
  parsePrFile,
  prCreateArgs,
  pushArgs,
} from './integrate.js';
import type { BacklogEvent } from './stream.js';

// The worker is commit-only (issue #17 cluster A, A1): it physically cannot
// push (git push / gh pr removed from its allowlist). The TRUSTED orchestrator
// pushes the worker's branch with an explicit, non-force refspec and opens the
// PR. These pure builders + the injected-runner orchestration are the boundary.

describe('pushArgs', () => {
  it('builds an explicit, non-force refspec push', () => {
    expect(pushArgs('auto/DEV-42')).toEqual([
      'push',
      'origin',
      'auto/DEV-42:refs/heads/auto/DEV-42',
    ]);
  });

  it('never includes a force flag', () => {
    expect(pushArgs('auto/DEV-42').join(' ')).not.toMatch(/--force|-f\b/);
  });
});

describe('prCreateArgs', () => {
  it('passes an explicit base and head, with the worker title + body', () => {
    const args = prCreateArgs('main', 'auto/DEV-42', { title: 'feat: x', body: 'why: ...' });
    expect(args).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'auto/DEV-42',
      '--title',
      'feat: x',
      '--body',
      'why: ...',
    ]);
  });

  it('falls back to --fill (PR body from commits) when the worker reported none', () => {
    const args = prCreateArgs('main', 'auto/DEV-42', undefined);
    expect(args).toEqual(['pr', 'create', '--base', 'main', '--head', 'auto/DEV-42', '--fill']);
  });
});

describe('parsePrFile', () => {
  it('reads the first non-empty line as title and the rest as body', () => {
    expect(parsePrFile('feat: rate limiter\n\nWhy: protects the API.\n')).toEqual({
      title: 'feat: rate limiter',
      body: 'Why: protects the API.',
    });
  });

  it('tolerates a title-only file (empty body)', () => {
    expect(parsePrFile('feat: x\n')).toEqual({ title: 'feat: x', body: '' });
  });
});

describe('branchFromEvents', () => {
  const ev = (name: string): BacklogEvent => ({ kind: 'branch', name });

  it('returns the last reported branch', () => {
    expect(branchFromEvents([ev('a'), { kind: 'phase', phase: 'ship' }, ev('b')], 'fb')).toBe('b');
  });

  it('falls back when the worker reported no branch', () => {
    expect(branchFromEvents([{ kind: 'phase', phase: 'ship' }], 'auto/DEV-7')).toBe('auto/DEV-7');
  });
});

describe('integrateTicket', () => {
  const ok = { ok: true, stdout: '', stderr: '' };

  it('pushes the branch then opens the PR, returning the PR url', () => {
    const calls: Array<{ cmd: string; args: readonly string[]; cwd: string }> = [];
    const run: IntegrateRun = (cmd, args, cwd) => {
      calls.push({ cmd, args, cwd });
      if (cmd === 'gh') return { ok: true, stdout: 'https://github.com/o/r/pull/7\n', stderr: '' };
      return ok;
    };
    const outcome = integrateTicket({
      branch: 'auto/DEV-42',
      base: 'main',
      cwd: '/wt',
      run,
    });
    expect(outcome).toEqual({ pushed: true, prRef: 'https://github.com/o/r/pull/7' });
    expect(calls[0]).toEqual({ cmd: 'git', args: pushArgs('auto/DEV-42'), cwd: '/wt' });
    expect(calls[1]?.cmd).toBe('gh');
    expect(calls[1]?.args).toContain('--head');
  });

  it('requests auto-merge after opening the PR when autoMerge is on', () => {
    const cmds: string[] = [];
    const run: IntegrateRun = (cmd, args) => {
      cmds.push(`${cmd} ${args[0] ?? ''}`);
      if (cmd === 'gh' && args[1] === 'create') {
        return { ok: true, stdout: 'https://github.com/o/r/pull/9\n', stderr: '' };
      }
      return ok;
    };
    const outcome = integrateTicket({
      branch: 'auto/DEV-9',
      base: 'main',
      cwd: '/wt',
      autoMerge: true,
      run,
    });
    expect(outcome.pushed).toBe(true);
    expect(outcome.autoMergeRequested).toBe(true);
    expect(cmds).toEqual(['git push', 'gh pr', 'gh pr']); // push, pr create, pr merge
  });

  it('does not request auto-merge by default', () => {
    const run: IntegrateRun = (cmd) =>
      cmd === 'gh' ? { ok: true, stdout: 'https://github.com/o/r/pull/1', stderr: '' } : ok;
    const outcome = integrateTicket({ branch: 'auto/DEV-1', base: 'main', cwd: '/wt', run });
    expect(outcome.autoMergeRequested).toBeUndefined();
  });

  it('does NOT open a PR when the push fails', () => {
    const calls: string[] = [];
    const run: IntegrateRun = (cmd) => {
      calls.push(cmd);
      if (cmd === 'git') return { ok: false, stdout: '', stderr: 'protected branch' };
      return ok;
    };
    const outcome = integrateTicket({ branch: 'auto/DEV-42', base: 'main', cwd: '/wt', run });
    expect(outcome.pushed).toBe(false);
    expect(outcome.error).toContain('protected branch');
    expect(calls).toEqual(['git']); // gh never invoked
  });
});
