import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAIN_CAP,
  planChainStep,
  renderMergeJournal,
  type MergedUnit,
  type PostMergeObservation,
} from './chain.js';

const SHA = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);

const unit = (over: Partial<MergedUnit> = {}): MergedUnit => ({
  tickets: ['DEV-1'],
  integrationSha: SHA,
  mergeCommit: MERGE,
  unionVerdict: 'clean',
  checks: ['validate', 'enforce'],
  ...over,
});

const green: PostMergeObservation = { kind: 'green', sha: MERGE, suite: '3843 passed' };

const step = (over: Partial<Parameters<typeof planChainStep>[0]> = {}) =>
  planChainStep({ merged: [unit()], cap: DEFAULT_CHAIN_CAP, postMerge: green, nextReady: 3, ...over });

describe('what keeps a chain going', () => {
  it('continues while the base is green and units remain', () => {
    expect(step().kind).toBe('continue');
  });

  it('stops when nothing is ready, which is a nominal end and not a failure', () => {
    const decision = step({ nextReady: 0 });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('nothing-ready');
      expect(decision.failed).toBe(false);
    }
  });
});

describe('what stops a chain', () => {
  // The whole point of chaining: one bad merge must not become ten.
  it('stops immediately when the suite is red on the merged base, naming the SHA', () => {
    const decision = step({
      postMerge: { kind: 'red', sha: MERGE, failing: ['packages/cli/x.test.ts'] },
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('post-merge-red');
      expect(decision.failed).toBe(true);
      expect(decision.detail).toContain(MERGE.slice(0, 7));
      expect(decision.detail).toContain('packages/cli/x.test.ts');
    }
  });

  // Not observing is not the same as being fine, and it must not read as fine.
  it('stops when the merged base was never verified at all', () => {
    const decision = step({ postMerge: undefined });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('post-merge-unverified');
      expect(decision.failed).toBe(true);
    }
  });

  it('stops at the cap, so an unattended run has a bound', () => {
    const decision = step({ merged: [unit(), unit(), unit()], cap: 3 });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('cap-reached');
      expect(decision.failed).toBe(false);
    }
  });

  it('reports the red base rather than the cap when both are true', () => {
    // A cap reached on a broken base is still a broken base; saying "cap" would
    // read as a nominal end and send nobody to look.
    const decision = step({
      merged: [unit(), unit(), unit()],
      cap: 3,
      postMerge: { kind: 'red', sha: MERGE, failing: ['x'] },
    });
    if (decision.kind === 'stop') expect(decision.reason).toBe('post-merge-red');
  });

  it('never continues past a stop, whatever remains ready', () => {
    const decision = step({ postMerge: { kind: 'red', sha: MERGE, failing: ['x'] }, nextReady: 99 });
    expect(decision.kind).toBe('stop');
  });
});

describe('the journal a person reads afterwards', () => {
  it('names what merged, in order, with the evidence each merge rested on', () => {
    const journal = renderMergeJournal([
      unit({ tickets: ['DEV-1', 'DEV-2'], mergeCommit: 'c'.repeat(40) }),
      unit({ tickets: ['DEV-3'] }),
    ]);
    expect(journal).toContain('DEV-1, DEV-2');
    expect(journal).toContain('DEV-3');
    expect(journal).toContain('ccccccc');
    expect(journal).toContain('clean');
    expect(journal).toContain('validate');
  });

  it('says plainly that nothing merged, rather than rendering an empty list', () => {
    expect(renderMergeJournal([]).toLowerCase()).toContain('nothing');
  });
});
