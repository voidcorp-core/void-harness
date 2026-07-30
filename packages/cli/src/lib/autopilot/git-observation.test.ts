import { describe, expect, it } from 'vitest';
import { type ObservedCommit, type RangeObservation, verifyRange } from './git-observation.js';

const BASE = '0000000000000000000000000000000000000001';
const C1 = '0000000000000000000000000000000000000011';
const C2 = '0000000000000000000000000000000000000012';
const FOREIGN = '00000000000000000000000000000000000000ff';

function commit(sha: string, ...parents: string[]): ObservedCommit {
  return { sha, parents };
}

function observation(over: Partial<RangeObservation> = {}): RangeObservation {
  return {
    ticketId: 'DEV-1',
    baseSha: BASE,
    headSha: C2,
    // What `git rev-list --parents base..head` reported, oldest first.
    commits: [commit(C1, BASE), commit(C2, C1)],
    ...over,
  };
}

describe('verifyRange', () => {
  it('accepts a linear range descended from its declared base', () => {
    const verdict = verifyRange(observation(), { declaredCommits: [C1, C2] });

    expect(verdict).toEqual({ kind: 'usable', commits: [C1, C2] });
  });

  it('accepts a single-commit range', () => {
    const verdict = verifyRange(
      observation({ headSha: C1, commits: [commit(C1, BASE)] }),
      { declaredCommits: [C1] },
    );

    expect(verdict.kind).toBe('usable');
  });

  it('refuses a range whose first commit does not descend from the base', () => {
    // The worker branched from somewhere else. Merging this would carry in
    // whatever sits between the real base and its actual root.
    const verdict = verifyRange(
      observation({ commits: [commit(C1, FOREIGN), commit(C2, C1)] }),
      { declaredCommits: [C1, C2] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'not-descended-from-base' });
  });

  it('refuses a range containing a merge commit', () => {
    // A merge inside a worker range means it absorbed history the reconciler
    // never validated — the exact case a clean `git merge` exit code hides.
    const verdict = verifyRange(
      observation({ commits: [commit(C1, BASE), commit(C2, C1, FOREIGN)] }),
      { declaredCommits: [C1, C2] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'contains-merge' });
  });

  it('refuses a range carrying a commit the worker never declared', () => {
    const verdict = verifyRange(
      observation({ commits: [commit(C1, BASE), commit(FOREIGN, C1), commit(C2, FOREIGN)] }),
      { declaredCommits: [C1, C2] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'foreign-commit' });
    expect((verdict as { detail: string }).detail).toContain(FOREIGN);
  });

  it('refuses a range missing a commit the worker declared', () => {
    const verdict = verifyRange(
      observation({ headSha: C1, commits: [commit(C1, BASE)] }),
      { declaredCommits: [C1, C2] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'missing-commit' });
  });

  it('refuses a range whose head is not its last commit', () => {
    const verdict = verifyRange(observation({ headSha: C1 }), { declaredCommits: [C1, C2] });

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'head-mismatch' });
  });

  it('refuses a range whose order contradicts its parent links', () => {
    // Reported newest-first, or reordered: either way the chain does not hold.
    const verdict = verifyRange(
      observation({ commits: [commit(C2, C1), commit(C1, BASE)] }),
      { declaredCommits: [C1, C2] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'broken-chain' });
  });

  it('refuses an empty range because there is nothing to integrate', () => {
    const verdict = verifyRange(observation({ commits: [], headSha: BASE }), { declaredCommits: [] });

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'empty-range' });
  });

  it('refuses a range larger than the bound', () => {
    const many = Array.from({ length: 12 }, (_, i) => `${'0'.repeat(38)}${(i + 20).toString(16).padStart(2, '0')}`);
    const chain = many.map((sha, index) => commit(sha, index === 0 ? BASE : (many[index - 1] as string)));
    const verdict = verifyRange(
      observation({ headSha: many[many.length - 1] as string, commits: chain }),
      { declaredCommits: many, maxCommits: 10 },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'range-too-large' });
  });

  it('refuses a base that equals the head, because that range is empty by definition', () => {
    const verdict = verifyRange(
      observation({ baseSha: C2, headSha: C2, commits: [] }),
      { declaredCommits: [] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'empty-range' });
  });

  it('refuses a malformed observation rather than reasoning about half of it', () => {
    const verdict = verifyRange(
      observation({ commits: [commit('not-a-sha', BASE)] }),
      { declaredCommits: ['not-a-sha'] },
    );

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'malformed-observation' });
  });

  it('names the ticket in every rejection, so a cluster failure is attributable', () => {
    const verdict = verifyRange(observation({ headSha: C1 }), { declaredCommits: [C1, C2] });

    expect((verdict as { ticketId: string }).ticketId).toBe('DEV-1');
  });
});
