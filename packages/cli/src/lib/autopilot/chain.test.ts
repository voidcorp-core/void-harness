import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAIN_BUDGET_MS,
  parseChainBudget,
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

const MINUTE = 60_000;

const step = (over: Partial<Parameters<typeof planChainStep>[0]> = {}) =>
  planChainStep({
    merged: [unit()],
    budgetMs: DEFAULT_CHAIN_BUDGET_MS,
    elapsedMs: 10 * MINUTE,
    postMerge: green,
    nextReady: 3,
    ...over,
  });

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

  it('stops when the time you gave it is spent', () => {
    const decision = step({ budgetMs: 60 * MINUTE, elapsedMs: 61 * MINUTE });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('budget-spent');
      expect(decision.failed).toBe(false);
    }
  });

  // A unit already under way is never cut in half — the budget decides whether to
  // START another one. Cutting mid-unit would leave a worktree and a half-done
  // ticket, which costs more to clean up than the overrun it saved.
  it('projects from what the run has actually taken, rather than starting a unit it cannot finish', () => {
    // Two merges in 100 minutes: about 50 minutes each. 30 minutes left is not enough.
    const decision = step({
      merged: [unit(), unit()],
      budgetMs: 130 * MINUTE,
      elapsedMs: 100 * MINUTE,
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('budget-spent');
      expect(decision.detail).toMatch(/would not finish|not enough/i);
    }
  });

  it('continues when the remaining time comfortably fits another unit', () => {
    expect(step({ merged: [unit(), unit()], budgetMs: 300 * MINUTE, elapsedMs: 100 * MINUTE }).kind)
      .toBe('continue');
  });

  it('reports the red base rather than the spent budget when both are true', () => {
    // A budget spent on a broken base is still a broken base; saying "time is up"
    // would read as a nominal end and send nobody to look.
    const decision = step({
      budgetMs: 60 * MINUTE,
      elapsedMs: 61 * MINUTE,
      postMerge: { kind: 'red', sha: MERGE, failing: ['x'] },
    });
    if (decision.kind === 'stop') expect(decision.reason).toBe('post-merge-red');
  });

  it('never continues past a stop, whatever remains ready', () => {
    const decision = step({ postMerge: { kind: 'red', sha: MERGE, failing: ['x'] }, nextReady: 99 });
    expect(decision.kind).toBe('stop');
  });
});

describe('the budget a person says out loud', () => {
  it('reads the durations someone actually types', () => {
    expect(parseChainBudget('2h')).toBe(120 * MINUTE);
    expect(parseChainBudget('6h')).toBe(360 * MINUTE);
    expect(parseChainBudget('90m')).toBe(90 * MINUTE);
    expect(parseChainBudget('1h30m')).toBe(90 * MINUTE);
    expect(parseChainBudget('  4H ')).toBe(240 * MINUTE);
  });

  it('refuses what is not a duration, rather than guessing a number of hours', () => {
    for (const bad of ['', 'soon', '2', '-1h', '0h', 'h']) {
      expect(() => parseChainBudget(bad), bad).toThrow();
    }
  });

  it('refuses a budget longer than anyone reviews in one sitting', () => {
    expect(() => parseChainBudget('48h')).toThrow(/24h|too long/i);
  });

  it('defaults to two hours, which is the length of a session someone waits through', () => {
    expect(DEFAULT_CHAIN_BUDGET_MS).toBe(120 * MINUTE);
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
