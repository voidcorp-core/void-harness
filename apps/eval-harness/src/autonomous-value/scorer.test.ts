import { describe, expect, it } from 'vitest';
import { sealCellEvidence, type EvidenceExpectation, type ExecutorEvidenceInput } from './evidence.js';
import {
  MAX_CORRECTION_CYCLES,
  scoreAutonomousValueCell,
  type AutonomousValueScoreInput,
} from './scorer.js';
import type { RuntimeInvocation } from '../runtime/types.js';

const INVOCATION: RuntimeInvocation = { command: 'codex', args: ['exec', 'task'] };
const SHA = (letter: string): string => letter.repeat(40);
const DIGEST = (letter: string): string => `sha256:${letter.repeat(64)}`;

const expected: EvidenceExpectation = {
  cellId: 'implement-agent-alone',
  startCommit: SHA('a'),
  workspaceStartCommit: SHA('b'),
  fixtureDigest: DIGEST('c'),
  artifactDigest: DIGEST('d'),
  argv: INVOCATION,
  model: 'model',
  modelVersion: 'version',
  effort: 'high',
};

function evidence(): NonNullable<AutonomousValueScoreInput['evidence']> {
  const input: ExecutorEvidenceInput = {
    source: 'executor',
    ...expected,
    events: ['started', 'finished'],
    diff: 'diff',
    output: 'done',
    diagnostics: '',
    outcome: {
      kind: 'succeeded',
      exitCode: 0,
      timedOut: false,
      interrupted: false,
      childProcessAlive: false,
    },
    cleanup: { kind: 'complete', attempts: 1 },
  };
  const result = sealCellEvidence(input, expected);
  if (!result.ok) throw new Error(`test evidence was not sealed: ${result.error.kind}`);
  return result.value;
}

const goodInput = (overrides: Partial<AutonomousValueScoreInput> = {}): AutonomousValueScoreInput => ({
  evidence: evidence(),
  quality: {
    criticalDefect: false,
    falseGreen: false,
    inventedProof: false,
    correctionCycles: 0,
    correctionResolved: true,
  },
  comparability: { expected: 'codex/model/version/high/profile/seed', actual: 'codex/model/version/high/profile/seed' },
  ...overrides,
});

describe('scoreAutonomousValueCell', () => {
  it('returns an admissible positive result when evidence and quality gates pass', () => {
    const result = scoreAutonomousValueCell(goodInput());
    expect(result.admissible).toBe(true);
    expect(result.absoluteGates.every((gate) => gate.passed)).toBe(true);
    expect(result.secondaryScore).toBe(1);
  });

  it.each([
    ['critical defect', { criticalDefect: true }],
    ['false green', { falseGreen: true }],
    ['invented proof', { inventedProof: true }],
  ] as const)('disqualifies a cell for a %s even with a perfect secondary score', (_name, quality) => {
    const result = scoreAutonomousValueCell(goodInput({ quality: { ...goodInput().quality, ...quality } }));
    expect(result.admissible).toBe(false);
    expect(result.secondaryScore).toBe(1);
    expect(result.absoluteGates.some((gate) => !gate.passed)).toBe(true);
  });

  it('keeps an unresolved correction outside develop after three cycles', () => {
    const result = scoreAutonomousValueCell(goodInput({
      quality: { ...goodInput().quality, correctionCycles: MAX_CORRECTION_CYCLES, correctionResolved: false },
    }));
    expect(result.admissible).toBe(false);
    expect(result.absoluteGates).toContainEqual(expect.objectContaining({ kind: 'unresolved-correction', passed: false }));
  });

  it('does not fail the correction gate when the third cycle resolves the defect', () => {
    const result = scoreAutonomousValueCell(goodInput({
      quality: { ...goodInput().quality, correctionCycles: MAX_CORRECTION_CYCLES, correctionResolved: true },
    }));
    expect(result.admissible).toBe(true);
  });

  it('never treats absent evidence as a successful cell', () => {
    const result = scoreAutonomousValueCell(goodInput({ evidence: undefined }));
    expect(result.admissible).toBe(false);
    expect(result.absoluteGates).toContainEqual(expect.objectContaining({ kind: 'evidence', passed: false }));
  });

  it('rejects a non-comparable runtime instead of averaging it into a pass', () => {
    const result = scoreAutonomousValueCell(goodInput({
      comparability: { expected: 'stable-a', actual: 'stable-b' },
    }));
    expect(result.admissible).toBe(false);
    expect(result.absoluteGates).toContainEqual(expect.objectContaining({ kind: 'comparability', passed: false }));
  });

  it('rejects a correction count beyond the bounded ceiling', () => {
    const result = scoreAutonomousValueCell(goodInput({
      quality: { ...goodInput().quality, correctionCycles: MAX_CORRECTION_CYCLES + 1, correctionResolved: true },
    }));
    expect(result.admissible).toBe(false);
  });
});
