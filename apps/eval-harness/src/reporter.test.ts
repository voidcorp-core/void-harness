import { describe, expect, it } from 'vitest';
import { formatHeadToHead, formatReport } from './reporter.js';
import type { EvalReport, HeadToHeadReport } from './types.js';

const report: EvalReport = {
  skill: 'commit-discipline',
  title: 'commit a change with a good message',
  runsPerCondition: 3,
  withSkill: { scores: [1, 1, 0.66], meanScore: 0.887, okRuns: 3, costUsd: 0.12 },
  withoutSkill: { scores: [0.33, 0.33, 0.66], meanScore: 0.44, okRuns: 3, costUsd: 0.1 },
  delta: 0.447,
  verdict: 'skill-helps',
  totalCostUsd: 0.22,
};

describe('formatReport', () => {
  it('renders the skill, verdict, both means and the cost', () => {
    const out = formatReport(report);
    expect(out).toContain('commit-discipline');
    expect(out).toContain('skill-helps');
    expect(out).toContain('with skill');
    expect(out).toContain('without skill');
    expect(out).toContain('$0.22');
  });
});

describe('formatHeadToHead', () => {
  const h2h: HeadToHeadReport = {
    skill: 'brainstorming',
    title: 'pressure-test',
    runs: 4,
    aWins: 3,
    bWins: 1,
    ties: 0,
    verdict: 'distillate-better',
  };

  it('renders the skill, verdict and the distillate/source/tie counts', () => {
    const out = formatHeadToHead(h2h);
    expect(out).toContain('brainstorming');
    expect(out).toContain('distillate-better');
    expect(out).toContain('distillate wins');
    expect(out).toContain('source wins');
    // the counts row: 3 distillate | 1 source | 0 ties
    expect(out).toContain('| 3 | 1 | 0 |');
  });
});
