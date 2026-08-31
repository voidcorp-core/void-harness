import { describe, expect, it } from 'vitest';
import {
  judgeProof,
  judgeRangeProofs,
  type RequiredProof,
} from './required-proof.js';

const TREE = `sha256:${'a'.repeat(64)}`;
const OTHER_TREE = `sha256:${'b'.repeat(64)}`;

const SUITE: RequiredProof = {
  id: 'suite-green',
  proofClass: 'absolute',
  command: ['pnpm', 'test'],
};
const SURFACE: RequiredProof = {
  id: 'surface-run',
  proofClass: 'escalating',
  command: ['pnpm', 'dogfood'],
};

function evidence(over: Record<string, unknown> = {}) {
  return {
    evidenceId: 'evd_1',
    command: ['pnpm', 'test'],
    diffHash: TREE,
    status: 'passed' as const,
    exitCode: 0,
    ...over,
  };
}

describe('judgeProof', () => {
  it('is satisfied by sealed evidence for the declared command on the merged tree', () => {
    expect(judgeProof(SUITE, [evidence()], TREE)).toEqual({
      kind: 'satisfied',
      evidenceId: 'evd_1',
    });
  });

  it('is refuted when the declared command ran and failed, which is a red suite', () => {
    const outcome = judgeProof(SUITE, [evidence({ status: 'failed', exitCode: 1 })], TREE);

    expect(outcome.kind).toBe('refuted');
  });

  // The hole the Eng lens found: sealing an argv does not constrain it. A worker
  // requesting the suite on one file produces evidence that is sealed, fresh and
  // correctly bound -- and worthless. Its own claim, laundered through the executor.
  it('refuses evidence for a narrowed command, however well sealed', () => {
    const narrowed = evidence({ command: ['pnpm', 'test', 'one.test.ts'] });
    const outcome = judgeProof(SUITE, [narrowed], TREE);

    expect(outcome.kind).toBe('unproven');
    if (outcome.kind === 'unproven') expect(outcome.reason).toBe('command-mismatch');
  });

  it('refuses evidence sealed against another tree, because a stale proof is unproven', () => {
    const outcome = judgeProof(SUITE, [evidence({ diffHash: OTHER_TREE })], TREE);

    expect(outcome.kind).toBe('unproven');
    if (outcome.kind === 'unproven') expect(outcome.reason).toBe('stale-tree');
  });

  it('reports absence as absence, never as a pass', () => {
    const outcome = judgeProof(SUITE, [], TREE);

    expect(outcome.kind).toBe('unproven');
    if (outcome.kind === 'unproven') expect(outcome.reason).toBe('absent');
  });

  // Three causes that used to read alike. A red suite ends the run; nobody having
  // proved it is a retry. Conflating them ends a six-hour run on one flaky crash.
  it('separates a suite that failed from a suite nobody proved', () => {
    const red = judgeProof(SUITE, [evidence({ status: 'failed' })], TREE);
    const absent = judgeProof(SUITE, [], TREE);

    expect(red.kind).not.toBe(absent.kind);
  });

  it('names the command it wanted, so a reader does not go looking for it', () => {
    const outcome = judgeProof(SUITE, [evidence({ command: ['pnpm', 'lint'] })], TREE);

    if (outcome.kind === 'unproven') expect(outcome.detail).toContain('pnpm test');
  });
});

describe('judgeRangeProofs', () => {
  it('merges when every absolute proof is satisfied', () => {
    const verdict = judgeRangeProofs([SUITE], [evidence()], TREE);

    expect(verdict.kind).toBe('merge');
    expect(verdict.debts).toEqual([]);
  });

  it('refuses when an absolute proof is unproven, and names it', () => {
    const verdict = judgeRangeProofs([SUITE], [], TREE);

    expect(verdict.kind).toBe('refuse');
    if (verdict.kind === 'refuse') expect(verdict.detail).toContain('suite-green');
  });

  it('merges an unproven ESCALATING proof, carrying a typed debt instead of stalling', () => {
    const verdict = judgeRangeProofs([SUITE, SURFACE], [evidence()], TREE);

    expect(verdict.kind).toBe('merge');
    expect(verdict.debts).toHaveLength(1);
    expect(verdict.debts[0]?.proof).toBe('surface-run');
    expect(verdict.debts[0]?.severity).toBeDefined();
  });

  it('stops the chain on a refuted absolute proof, and only retries an unproven one', () => {
    const red = judgeRangeProofs([SUITE], [evidence({ status: 'failed' })], TREE);
    const absent = judgeRangeProofs([SUITE], [], TREE);

    expect(red.kind === 'refuse' && red.action).toBe('STOP_CHAIN');
    expect(absent.kind === 'refuse' && absent.action).toBe('RETRY_MODIFIED');
  });

  it('does not pass by vacuity when a unit declares no proof at all', () => {
    // An empty declaration is a programme that owes nothing, which is a
    // misconfiguration rather than a clean unit. It refuses and says so.
    const verdict = judgeRangeProofs([], [evidence()], TREE);

    expect(verdict.kind).toBe('refuse');
    if (verdict.kind === 'refuse') expect(verdict.detail).toMatch(/declare/i);
  });

  it('refuses a declaration whose command is empty, rather than matching everything', () => {
    const loose = { ...SUITE, command: [] as readonly string[] };

    // AUTOPILOT_CONTRACT, not a fifth error code: the taxonomy has four and a
    // declaration that cannot be honoured is a contract violation. The first
    // version of this test asserted an invented code.
    expect(() => judgeRangeProofs([loose], [evidence()], TREE)).toThrow(/AUTOPILOT_CONTRACT/);
  });
});
