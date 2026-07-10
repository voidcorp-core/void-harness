import { describe, expect, it, vi } from 'vitest';
import { aggregateHeadToHead, judgeScorer } from './judge.js';
import type { Judge, RunOutcome } from './types.js';

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  ok: true,
  costUsd: 0,
  files: {},
  lastCommit: undefined,
  transcript: 'the agent asked six forcing questions and refused to design yet',
  ...over,
});

const GRID = { criteria: ['forcing questions deployed', 'no premature design'] };

describe('judgeScorer', () => {
  it('maps a judge verdict to a ScoreResult', async () => {
    const judge: Judge = async () => ({
      score: 0.75,
      signals: { 'forcing questions deployed': true, 'no premature design': false },
      reason: 'four of six questions, but sketched a schema',
    });
    const result = await judgeScorer(judge, GRID)(outcome());
    expect(result.score).toBe(0.75);
    expect(result.signals).toEqual({ 'forcing questions deployed': true, 'no premature design': false });
  });

  it('passes the transcript and grid criteria to the judge', async () => {
    const judge = vi.fn<Judge>(async () => ({ score: 1, signals: {}, reason: 'ok' }));
    await judgeScorer(judge, GRID)(outcome({ transcript: 'hello' }));
    expect(judge).toHaveBeenCalledWith({ transcript: 'hello', criteria: GRID.criteria });
  });

  it('scores a crashed run 0 WITHOUT spending a judge call', async () => {
    const judge = vi.fn<Judge>(async () => ({ score: 1, signals: {}, reason: 'unreachable' }));
    const result = await judgeScorer(judge, GRID)(outcome({ ok: false }));
    expect(result.score).toBe(0);
    expect(judge).not.toHaveBeenCalled();
  });

  it('scores an empty transcript 0 WITHOUT a judge call (nothing to judge)', async () => {
    const judge = vi.fn<Judge>(async () => ({ score: 1, signals: {}, reason: 'unreachable' }));
    const result = await judgeScorer(judge, GRID)(outcome({ transcript: '   ' }));
    expect(result.score).toBe(0);
    expect(judge).not.toHaveBeenCalled();
  });
});

describe('aggregateHeadToHead', () => {
  const meta = { skill: 'brainstorming', title: 'pressure-test', runs: 4 };

  it('counts wins per condition (A = distillate, B = source) and names the winner', () => {
    const r = aggregateHeadToHead(['A', 'A', 'B', 'tie'], meta);
    expect({ a: r.aWins, b: r.bWins, t: r.ties }).toEqual({ a: 2, b: 1, t: 1 });
    expect(r.verdict).toBe('distillate-better');
  });

  it('verdicts source-better when B wins more', () => {
    expect(aggregateHeadToHead(['B', 'B', 'A'], meta).verdict).toBe('source-better');
  });

  it('verdicts tie on an equal split', () => {
    expect(aggregateHeadToHead(['A', 'B'], meta).verdict).toBe('tie');
  });

  it('verdicts tie when ties dominate and A==B', () => {
    expect(aggregateHeadToHead(['tie', 'tie'], meta).verdict).toBe('tie');
  });
});
