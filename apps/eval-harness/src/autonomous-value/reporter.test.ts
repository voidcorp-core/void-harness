import { describe, expect, it } from 'vitest';
import { renderAutonomousValueReport } from './reporter.js';
import type { AutonomousValueScoreResult } from './scorer.js';
import type { BlindReviewResult } from './reviewer.js';

const score: AutonomousValueScoreResult = {
  admissible: false,
  absoluteGates: [
    { kind: 'critical-defect', passed: false, detail: 'critical defect found' },
    { kind: 'evidence', passed: true, detail: 'sealed evidence verified' },
  ],
  secondaryScore: 0.75,
  secondaryMetrics: [
    { name: 'quality', value: 0.75 },
    { name: 'cost', value: undefined, unknownReason: 'provider omitted cost' },
  ],
};

const review: BlindReviewResult = {
  kind: 'reviewed',
  order: 'A-first',
  winner: 'tie',
  reason: 'both sides need more evidence',
  reviewerContext: 'reviewer-2026-09-07',
};

describe('renderAutonomousValueReport', () => {
  it('separates gates, defects, corrections, interventions and operational metrics', () => {
    const output = renderAutonomousValueReport({
      blindLabel: 'A',
      score,
      review,
      defects: [{ kind: 'critical', detail: 'critical defect found' }],
      corrections: [{ cycle: 1, resolved: false, detail: 'missing test' }],
      humanInterventions: 0,
      durationMs: { kind: 'known', value: 1250 },
      resources: { kind: 'known', value: '1 workspace, 2 processes' },
      costUsd: { kind: 'unknown', reason: 'provider omitted cost' },
      resume: { kind: 'not-resumable', reason: 'cell is disposable' },
      cleanup: { kind: 'complete', attempts: 1 },
    });
    expect(output).toContain('## Absolute gates');
    expect(output).toContain('## Defects');
    expect(output).toContain('## Corrections');
    expect(output).toContain('## Human interventions');
    expect(output).toContain('## Duration');
    expect(output).toContain('## Resources');
    expect(output).toContain('## Cost');
    expect(output).toContain('unknown: provider omitted cost');
    expect(output).toContain('## Resume');
    expect(output).toContain('## Cleanup');
  });

  it('keeps a blind report free of condition names and redacts secret-shaped text', () => {
    const output = renderAutonomousValueReport({
      blindLabel: 'B',
      score: { ...score, absoluteGates: [{ kind: 'evidence', passed: true, detail: 'token=secret-value' }] },
      review: { kind: 'unknown', reason: 'missing reviewer context' },
      defects: [],
      corrections: [],
      humanInterventions: 0,
      durationMs: { kind: 'unknown', reason: 'timer unavailable' },
      resources: { kind: 'unknown', reason: 'runtime unavailable' },
      costUsd: { kind: 'unknown', reason: 'cost unavailable' },
      resume: { kind: 'unknown', reason: 'resume state unavailable' },
      cleanup: { kind: 'incomplete', attempts: 2, leftovers: ['child.pid'], detail: 'cleanup incomplete' },
    });
    expect(output).not.toMatch(/agent-alone|autopilot|implement|brainstorm/);
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('## Unknown');
  });
});
