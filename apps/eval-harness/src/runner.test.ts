import { describe, expect, it } from 'vitest';
import { runEval } from './runner.js';
import type { EvalCase, RunOnce, RunOutcome, Scorer } from './types.js';

// A scorer that reads a numeric score the fake outcome carries in a file, so a
// test can script per-run scores precisely without depending on real scorers.
const passthroughScorer: Scorer = (o) => ({ score: Number(o.files['score'] ?? '0'), signals: {} });

const evalCase = (scorer: Scorer = passthroughScorer): EvalCase => ({
  skill: 'demo',
  title: 'demo case',
  prompt: 'do the thing',
  fixture: {},
  scorer,
});

const outcome = (score: number, over: Partial<RunOutcome> = {}): RunOutcome => ({
  ok: true,
  costUsd: 0.01,
  files: { score: String(score) },
  lastCommit: undefined,
  ...over,
});

/** Fake port: returns `withScore` when the skill body is present, else `withoutScore`. */
const fakePort = (withScore: number, withoutScore: number, over: Partial<RunOutcome> = {}): RunOnce =>
  ({ skillBody }) => Promise.resolve(outcome(skillBody === undefined ? withoutScore : withScore, over));

describe('runEval — aggregation over N runs per condition', () => {
  it('runs N per condition and averages each side', async () => {
    const report = await runEval(evalCase(), 'SKILL PROSE', fakePort(1, 0), { runs: 3 });
    expect(report.withSkill.scores).toHaveLength(3);
    expect(report.withoutSkill.scores).toHaveLength(3);
    expect(report.withSkill.meanScore).toBe(1);
    expect(report.withoutSkill.meanScore).toBe(0);
    expect(report.runsPerCondition).toBe(3);
  });

  it('reports a positive delta and a skill-helps verdict when the skill lifts the score', async () => {
    const report = await runEval(evalCase(), 'SKILL PROSE', fakePort(0.9, 0.2), { runs: 3 });
    expect(report.delta).toBeCloseTo(0.7);
    expect(report.verdict).toBe('skill-helps');
  });

  it('reports no-signal when with and without are within the noise threshold', async () => {
    const report = await runEval(evalCase(), 'SKILL PROSE', fakePort(0.55, 0.5), { runs: 3, threshold: 0.15 });
    expect(report.verdict).toBe('no-signal');
  });

  it('reports skill-hurts when the skill lowers the score past the threshold', async () => {
    const report = await runEval(evalCase(), 'SKILL PROSE', fakePort(0.1, 0.8), { runs: 3 });
    expect(report.verdict).toBe('skill-hurts');
  });

  it('sums cost across every run of both conditions', async () => {
    const report = await runEval(evalCase(), 'SKILL PROSE', fakePort(1, 0, { costUsd: 0.05 }), { runs: 2 });
    // 2 runs x 2 conditions x $0.05
    expect(report.totalCostUsd).toBeCloseTo(0.2);
    expect(report.withSkill.costUsd).toBeCloseTo(0.1);
  });

  it('counts a crashed run as ok=false and scores it 0 (a failed run is a failed task)', async () => {
    let call = 0;
    const flaky: RunOnce = ({ skillBody }) => {
      call += 1;
      // First with-skill run crashes; the rest succeed with score 1 / 0.
      if (skillBody !== undefined && call === 1) return Promise.resolve(outcome(0, { ok: false, files: {}, error: 'timeout' }));
      return Promise.resolve(outcome(skillBody === undefined ? 0 : 1));
    };
    const report = await runEval(evalCase(), 'SKILL PROSE', flaky, { runs: 2 });
    expect(report.withSkill.okRuns).toBe(1);
    expect(report.withSkill.scores).toContain(0);
  });
});
