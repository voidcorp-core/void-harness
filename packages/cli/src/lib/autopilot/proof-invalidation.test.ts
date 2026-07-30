import { describe, expect, it } from 'vitest';
import { assessProofs, type ProofContext, type VerificationProof } from './proof-invalidation.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const MOVED = 'c92da52973cebd5e038d6f7879821da5a039b069';
const DIFF = 'a'.repeat(64);
const OTHER_DIFF = 'b'.repeat(64);
const OUTPUT = 'c'.repeat(64);

const TEST_CMD = ['pnpm', 'test'];
const BUILD_CMD = ['pnpm', 'build'];

function proof(over: Partial<VerificationProof> = {}): VerificationProof {
  return {
    name: 'test',
    command: TEST_CMD,
    integrationSha: SHA,
    diffHash: DIFF,
    outputHash: OUTPUT,
    passed: true,
    ...over,
  };
}

function context(over: Partial<ProofContext> = {}): ProofContext {
  return { integrationSha: SHA, diffHash: DIFF, requiredCommands: [TEST_CMD], ...over };
}

describe('assessProofs', () => {
  it('seals when every required command has a fresh passing proof', () => {
    const result = assessProofs([proof()], context());

    expect(result.sealed).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.statuses[0]).toEqual({ name: 'test', fresh: true });
  });

  it('stales a proof taken against another integration SHA', () => {
    // The classic rebase case: the suite was green, on a tree that no longer
    // exists.
    const result = assessProofs([proof({ integrationSha: MOVED })], context());

    expect(result.sealed).toBe(false);
    expect(result.statuses[0]).toMatchObject({ fresh: false, reason: 'integration-moved' });
  });

  it('stales a proof whose diff is not the one being published', () => {
    const result = assessProofs([proof({ diffHash: OTHER_DIFF })], context());

    expect(result.statuses[0]).toMatchObject({ fresh: false, reason: 'diff-changed' });
  });

  it('stales a proof for a command the plan no longer requires', () => {
    const result = assessProofs([proof({ command: ['pnpm', 'test', '--reporter=dot'] })], context());

    expect(result.statuses[0]).toMatchObject({ fresh: false, reason: 'command-changed' });
  });

  it('never treats a failed command as a proof', () => {
    const result = assessProofs([proof({ passed: false })], context());

    expect(result.statuses[0]).toMatchObject({ fresh: false, reason: 'failed' });
    expect(result.sealed).toBe(false);
  });

  it('reports a required command with no proof at all as missing', () => {
    const result = assessProofs([proof()], context({ requiredCommands: [TEST_CMD, BUILD_CMD] }));

    expect(result.sealed).toBe(false);
    expect(result.missing).toEqual([BUILD_CMD]);
  });

  it('does not seal on an empty plan, because proving nothing proves nothing', () => {
    expect(assessProofs([], context({ requiredCommands: [] })).sealed).toBe(false);
  });

  it('does not seal with no proofs at all', () => {
    const result = assessProofs([], context());

    expect(result.sealed).toBe(false);
    expect(result.missing).toEqual([TEST_CMD]);
  });

  it('seals when several commands are each freshly proven', () => {
    const result = assessProofs(
      [proof(), proof({ name: 'build', command: BUILD_CMD })],
      context({ requiredCommands: [TEST_CMD, BUILD_CMD] }),
    );

    expect(result.sealed).toBe(true);
  });

  it('distinguishes commands that differ only by argument order', () => {
    // `pnpm test --bail` and `pnpm --bail test` are not the same invocation, and
    // treating them as equal would accept a proof of something else.
    const result = assessProofs(
      [proof({ command: ['pnpm', '--filter', 'a', 'test'] })],
      context({ requiredCommands: [['pnpm', 'test', '--filter', 'a']] }),
    );

    expect(result.statuses[0]).toMatchObject({ fresh: false, reason: 'command-changed' });
  });

  it.each([
    ['a short sha', { integrationSha: '2b0e24d' }],
    ['a non-hash diff', { diffHash: 'nope' }],
    ['an unhashed output', { outputHash: '' }],
    ['an empty command', { command: [] as string[] }],
    ['a nameless proof', { name: '' }],
  ])('refuses %s as malformed rather than reasoning about it', (_label, over) => {
    const result = assessProofs([proof(over as Partial<VerificationProof>)], context());

    expect(result.statuses[0]).toMatchObject({ fresh: false, reason: 'malformed' });
    expect(result.sealed).toBe(false);
  });

  it('keeps one stale proof from invalidating a sibling that still holds', () => {
    const result = assessProofs(
      [proof({ integrationSha: MOVED }), proof({ name: 'build', command: BUILD_CMD })],
      context({ requiredCommands: [BUILD_CMD] }),
    );

    expect(result.sealed).toBe(true);
    expect(result.statuses[0]?.fresh).toBe(false);
    expect(result.statuses[1]?.fresh).toBe(true);
  });
});
