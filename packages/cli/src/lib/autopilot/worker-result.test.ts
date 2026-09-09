import { describe, expect, it } from 'vitest';
import type { ReviewProvenance } from './review-provenance.js';
import { parseWorkerResult, type WorkerResult } from './worker-result.js';

const BASE = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const C1 = 'c92da52973cebd5e038d6f7879821da5a039b069';
const C2 = 'd385e3a92e68bcfa548175675e4a11a6ee14213c';

const COMPLETED: WorkerResult = {
  schemaVersion: 1,
  ticketId: 'DEV-1',
  status: 'completed',
  branch: 'autopilot-worker/cluster-1/DEV-1',
  baseSha: BASE,
  headSha: C2,
  commits: [C1, C2],
  files: ['packages/cli/src/lib/thing.ts'],
  proofs: [{ name: 'test', command: ['pnpm', 'test'], hash: 'a'.repeat(64) }],
  decisions: [{ summary: 'Kept the existing error shape.', basis: 'convention' }],
  review: {
    kind: 'panel',
    passes: [
      { name: 'architecture', context: 'fresh-context-subagent' },
      { name: 'code-review', context: 'fresh-context-subagent' },
    ],
  },
  blocker: null,
};

const BLOCKED: WorkerResult = {
  ...COMPLETED,
  status: 'blocked',
  headSha: null,
  commits: [],
  files: [],
  proofs: [],
  blocker: 'The ticket needs a production secret this run may not read.',
};

function raw(over: Record<string, unknown> = {}, base: WorkerResult = COMPLETED): unknown {
  return { ...base, ...over };
}

describe('parseWorkerResult', () => {
  it('accepts a completed worker with its commit range', () => {
    expect(parseWorkerResult(raw())).toEqual(COMPLETED);
  });

  it('accepts a blocked worker that produced nothing', () => {
    expect(parseWorkerResult(raw({}, BLOCKED))).toEqual(BLOCKED);
  });

  it('rejects free text because a worker speaks the schema or it is not heard', () => {
    // Runtimes will happily return prose. Prose never enters the run state.
    expect(() => parseWorkerResult('I finished the ticket, all tests pass!')).toThrow(/schema/i);
    expect(() => parseWorkerResult(null)).toThrow(/schema/i);
    expect(() => parseWorkerResult([COMPLETED])).toThrow(/schema/i);
  });

  it('rejects an unknown schema version rather than guessing its fields', () => {
    expect(() => parseWorkerResult(raw({ schemaVersion: 2 }))).toThrow(/schemaVersion/);
  });

  it('rejects an unknown status', () => {
    expect(() => parseWorkerResult(raw({ status: 'mostly-done' }))).toThrow(/status/);
  });

  it('rejects a completed worker with no commit because success must be provable', () => {
    expect(() => parseWorkerResult(raw({ commits: [], headSha: null }))).toThrow(/commits/);
  });

  it('rejects a completed worker whose head is not its last commit', () => {
    expect(() => parseWorkerResult(raw({ headSha: C1 }))).toThrow(/headSha/);
  });

  it('rejects a commit range that repeats a commit', () => {
    expect(() => parseWorkerResult(raw({ commits: [C1, C1], headSha: C1 }))).toThrow(/commits/);
  });

  it('rejects a range that starts from its own base because base is not part of the work', () => {
    expect(() => parseWorkerResult(raw({ commits: [BASE, C2] }))).toThrow(/baseSha/);
  });

  it('rejects an abbreviated commit id', () => {
    expect(() => parseWorkerResult(raw({ commits: ['c92da52'], headSha: 'c92da52' }))).toThrow(/commits/);
  });

  it('rejects a completed worker with no proof at all', () => {
    // "It works" without a gate having run is the failure mode this exists for.
    expect(() => parseWorkerResult(raw({ proofs: [] }))).toThrow(/proofs/);
  });

  it('rejects a proof with no verifiable hash', () => {
    const proofs = [{ name: 'test', command: ['pnpm', 'test'], hash: 'nope' }];
    expect(() => parseWorkerResult(raw({ proofs }))).toThrow(/hash/);
  });

  it('rejects a proof whose command is not an argv array', () => {
    const proofs = [{ name: 'test', command: 'pnpm test', hash: 'a'.repeat(64) }];
    expect(() => parseWorkerResult(raw({ proofs }))).toThrow(/command/);
  });

  it('rejects a completed worker that also reports a blocker', () => {
    expect(() => parseWorkerResult(raw({ blocker: 'something' }))).toThrow(/blocker/);
  });

  it('rejects a blocked worker with no blocker because a stop needs a reason', () => {
    expect(() => parseWorkerResult(raw({ blocker: null }, BLOCKED))).toThrow(/blocker/);
  });

  it('accepts a blocked worker that committed before stopping', () => {
    const partial = parseWorkerResult(
      raw({ commits: [C1], headSha: C1, blocker: 'The second half needs a decision.' }, BLOCKED),
    );

    expect(partial.status).toBe('blocked');
    expect(partial.commits).toEqual([C1]);
  });

  it('rejects a decision whose basis is outside the authority order', () => {
    const decisions = [{ summary: 'Felt right.', basis: 'vibes' }];
    expect(() => parseWorkerResult(raw({ decisions }))).toThrow(/basis/);
  });

  it('rejects a branch name walking out of its directory', () => {
    expect(() => parseWorkerResult(raw({ branch: 'autopilot-worker/../../etc' }))).toThrow(/branch/);
  });

  it('bounds the file list so one runaway worker cannot become the state', () => {
    const files = Array.from({ length: 2001 }, (_, i) => `src/f${i}.ts`);
    expect(() => parseWorkerResult(raw({ files }))).toThrow(/files/);
  });

  it('bounds the blocker text', () => {
    expect(() => parseWorkerResult(raw({ blocker: 'x'.repeat(5000) }, BLOCKED))).toThrow(/blocker/);
  });

  it('ignores unknown fields rather than failing, so a newer runtime stays readable', () => {
    const result = parseWorkerResult(raw({ tokensUsed: 12345 }));
    expect(result).toEqual(COMPLETED);
    expect((result as unknown as Record<string, unknown>).tokensUsed).toBeUndefined();
  });
});

/**
 * A worker that could convene no panel ran every pass on itself and said so in
 * `decisions`, which nothing downstream reads. The record has to exist as a
 * value, refused here when it does not, or the guard that asks "did the panel
 * speak" has nothing to ask about.
 */
describe('parseWorkerResult review provenance', () => {
  const degraded: ReviewProvenance = {
    kind: 'self-review',
    passes: [{ name: 'code-review', context: 'self-review' }],
    because: 'this worker runtime exposes no fresh-context subagent primitive',
  };

  it('refuses a result that reports no review provenance at all', () => {
    const { review: _absent, ...without } = COMPLETED;

    expect(() => parseWorkerResult(without)).toThrow(/review/);
  });

  it('keeps a degradation the worker declared, verbatim', () => {
    expect(parseWorkerResult(raw({ review: degraded })).review).toEqual(degraded);
  });

  it('refuses a panel claimed over passes the worker ran itself', () => {
    expect(() =>
      parseWorkerResult(raw({ review: { kind: 'panel', passes: degraded.passes } })),
    ).toThrow(/self-review/);
  });

  // A blocked worker owes the record too: it is the one whose ticket someone
  // picks up next, and "was any of this reviewed" is the first question.
  it('refuses a blocked result that reports no review provenance', () => {
    const { review: _absent, ...without } = BLOCKED;

    expect(() => parseWorkerResult(without)).toThrow(/review/);
  });
});
