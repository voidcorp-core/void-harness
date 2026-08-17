import { describe, expect, it } from 'vitest';
import { composeResume, type ResumeInput } from './resume.js';
import { parseCheckpoint } from './checkpoint.js';

/**
 * Resume composes ONLY what exists. The gaps are the interesting part: a resume
 * that quietly filled a hole from git history would be confidently wrong at the
 * exact moment it is trusted most, so every hole is named instead.
 */

const NOW = Date.parse('2026-08-17T12:00:00Z');

function input(over: Partial<ResumeInput> = {}): ResumeInput {
  return {
    name: 'alpha',
    path: '/p/alpha',
    now: NOW,
    git: {
      available: true,
      branch: 'main',
      dirtyFiles: 0,
      unpushedCommits: 0,
      lastCommitAt: NOW,
      commitsToday: 2,
    },
    decisions: { format: 'per-file', count: 3, recent: [{ title: 'Use X', date: '2026-08-01' }], liveMonolithEntries: 0 },
    ...over,
  };
}

describe('composeResume', () => {
  it('carries the checkpoint through untouched', () => {
    const checkpoint = parseCheckpoint('## Objective\n\nShip the view.\n\n## Next action\n\nRun it.\n');

    const report = composeResume(input({ checkpoint, checkpointWrittenAt: NOW }));

    expect(report.checkpoint?.objective).toBe('Ship the view.');
    expect(report.checkpoint?.nextAction).toBe('Run it.');
  });

  it('names the missing checkpoint and says how to produce one', () => {
    const report = composeResume(input());

    const gap = report.gaps.find((item) => item.reason === 'no-checkpoint');
    expect(gap?.detail).toContain('session-handoff');
  });

  it('reports an empty checkpoint separately from a missing one', () => {
    const report = composeResume(input({ checkpoint: parseCheckpoint('# nothing\n') }));

    expect(report.gaps.map((gap) => gap.reason)).toContain('empty-checkpoint');
    expect(report.gaps.map((gap) => gap.reason)).not.toContain('no-checkpoint');
  });

  it('flags a checkpoint older than a week, without hiding it', () => {
    const checkpoint = parseCheckpoint('## Objective\n\nOld work.\n');

    const report = composeResume(input({
      checkpoint,
      checkpointWrittenAt: NOW - 12 * 86_400_000,
    }));

    expect(report.checkpointAgeDays).toBe(12);
    expect(report.gaps.map((gap) => gap.reason)).toContain('stale-checkpoint');
    expect(report.checkpoint?.objective).toBe('Old work.');
  });

  it('does not flag a fresh checkpoint as stale', () => {
    const report = composeResume(input({
      checkpoint: parseCheckpoint('## Objective\n\nToday.\n'),
      checkpointWrittenAt: NOW - 3_600_000,
    }));

    expect(report.gaps.map((gap) => gap.reason)).not.toContain('stale-checkpoint');
  });

  // Resuming from someone else's context is worse than resuming from nothing.
  it('warns when the checkpoint was written on another branch', () => {
    const checkpoint = parseCheckpoint('---\nbranch: feature/x\n---\n\n## Objective\n\nX.\n');

    const report = composeResume(input({ checkpoint, checkpointWrittenAt: NOW }));

    const gap = report.gaps.find((item) => item.reason === 'branch-moved');
    expect(gap?.detail).toContain('feature/x');
    expect(gap?.detail).toContain('main');
  });

  it('stays quiet when the checkpoint branch matches the tree', () => {
    const checkpoint = parseCheckpoint('---\nbranch: main\n---\n\n## Objective\n\nX.\n');

    const report = composeResume(input({ checkpoint, checkpointWrittenAt: NOW }));

    expect(report.gaps.map((gap) => gap.reason)).not.toContain('branch-moved');
  });

  it('names the absence of decisions, because "why is it like this" then has no answer', () => {
    const report = composeResume(input({
      decisions: { format: 'none', count: 0, recent: [], liveMonolithEntries: 0 },
    }));

    expect(report.gaps.map((gap) => gap.reason)).toContain('no-decisions');
  });

  it('reports no gap at all when everything is present and fresh', () => {
    const checkpoint = parseCheckpoint('---\nbranch: main\n---\n\n## Objective\n\nX.\n');

    const report = composeResume(input({ checkpoint, checkpointWrittenAt: NOW }));

    expect(report.gaps).toEqual([]);
  });

  it('passes the recent decisions through for the "what did I decide" question', () => {
    expect(composeResume(input()).recentDecisions[0]?.title).toBe('Use X');
  });

  it('survives a project with no git', () => {
    const report = composeResume(input({
      git: {
        available: false,
        branch: undefined,
        dirtyFiles: 0,
        unpushedCommits: 0,
        lastCommitAt: undefined,
        commitsToday: 0,
      },
    }));

    expect(report.branch).toBe(undefined);
    expect(() => composeResume(input())).not.toThrow();
  });
});
