import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAIN_BUDGET_MS,
  parseChainBudget,
  planChainStep,
  resolveChainBudget,
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
    taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
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

describe('the budget one run gets', () => {
  // The skill told consumers the invocation could override the declared budget,
  // and no code implemented it. Now it does -- in one direction. The programme
  // block is the consent to run unattended, and a command line that could widen
  // it would turn that declaration into a suggestion.
  it('takes the declared budget when nothing is asked for', () => {
    expect(resolveChainBudget({ declaredMs: DEFAULT_CHAIN_BUDGET_MS, declared: true }))
      .toBe(DEFAULT_CHAIN_BUDGET_MS);
  });

  it('lets one run ask for less than the programme declares', () => {
    expect(resolveChainBudget({ declaredMs: DEFAULT_CHAIN_BUDGET_MS, declared: true, requested: '30m' }))
      .toBe(30 * MINUTE);
  });

  it('refuses a request longer than the declaration, rather than clamping it silently', () => {
    // `declared: true` is what makes this a ceiling. The same number reached by
    // falling back is not one -- see "a fallback is not a declaration" below.
    expect(() => resolveChainBudget({
      declaredMs: DEFAULT_CHAIN_BUDGET_MS,
      declared: true,
      requested: '6h',
    })).toThrow(/never widen it/i);
  });

  it('refuses a request that is not a duration at all', () => {
    expect(() => resolveChainBudget({
      declaredMs: DEFAULT_CHAIN_BUDGET_MS,
      declared: false,
      requested: '6',
    })).toThrow(/not a duration/i);
  });
});

describe('what stops a chain', () => {
  // The merge-grant side already refuses a reading about another tree
  // (`review-stale`). The chain trusted any green observation it was handed,
  // including one taken before the merge landed, which is the reading that lets
  // the next unit start on an unverified base.
  it('stops when the suite was observed on a tree other than the merge commit', () => {
    const decision = step({ postMerge: { kind: 'green', sha: SHA, suite: '1068 passed' } });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('post-merge-stale');
      expect(decision.failed).toBe(true);
      expect(decision.detail).toContain(SHA.slice(0, 7));
    }
  });

  // `NaN <= 0` is false, and so is every other comparison, so an unreadable
  // budget read as "there is time left" and the chain continued on it.
  it('stops on a budget or a clock it cannot measure, rather than continuing', () => {
    for (const over of [
      { budgetMs: Number.NaN },
      { elapsedMs: Number.NaN },
      { budgetMs: Number.POSITIVE_INFINITY },
      { budgetMs: 0 },
      { elapsedMs: -1 },
    ]) {
      const decision = step(over);
      expect(decision.kind, JSON.stringify(over)).toBe('stop');
      if (decision.kind === 'stop') {
        expect(decision.reason, JSON.stringify(over)).toBe('budget-unreadable');
        expect(decision.failed).toBe(true);
      }
    }
  });


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
      taken: [{ tickets: ['DEV-1'], outcome: 'merged' }, { tickets: ['DEV-2'], outcome: 'merged' }],
      budgetMs: 130 * MINUTE,
      elapsedMs: 100 * MINUTE,
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('budget-spent');
      expect(decision.detail).toMatch(/would not finish|not enough/i);
    }
  });

  // The projection above needs a unit to have finished. The FIRST one has none,
  // so `run for 1m` -- a perfectly legal shortening -- used to start a unit that
  // takes the better part of an hour, and the ADR says a run cannot exceed what
  // was declared for it. Below what any unit here has ever taken, the run does
  // not start one at all.
  it('refuses to start a first unit in a run too short to finish one', () => {
    const decision = step({
      merged: [], taken: [], postMerge: undefined, budgetMs: 1 * MINUTE, elapsedMs: 0,
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('budget-spent');
      expect(decision.failed).toBe(false);
      expect(decision.detail).toMatch(/would not finish|not enough/i);
    }
  });

  // The control. The floor is a floor, not a second budget: an ordinary run
  // starts its first unit exactly as before.
  it('starts a first unit whenever the run has a working session in front of it', () => {
    const cold = { merged: [], taken: [], postMerge: undefined, elapsedMs: 0 };
    expect(step({ ...cold, budgetMs: 120 * MINUTE }).kind).toBe('continue');
    expect(step({ ...cold, budgetMs: 30 * MINUTE }).kind).toBe('continue');
  });

  it('continues when the remaining time comfortably fits another unit', () => {
    expect(step({
      merged: [unit(), unit()],
      taken: [{ tickets: ['DEV-1'], outcome: 'merged' }, { tickets: ['DEV-2'], outcome: 'merged' }],
      budgetMs: 300 * MINUTE,
      elapsedMs: 100 * MINUTE,
    }).kind).toBe('continue');
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

describe('a fallback is not a declaration', () => {
  // Folpe, 2026-08-30: "the 2h default must be the fallback when I ask for
  // autopilot without a duration". A default nobody wrote is not a ceiling
  // anybody consented to, and refusing an explicit `6h` against it is a default
  // impersonating a declaration -- the failure class this repository spent the
  // day closing everywhere else.
  it('lets an invocation name any duration when the programme declared none', () => {
    expect(resolveChainBudget({ declaredMs: DEFAULT_CHAIN_BUDGET_MS, declared: false, requested: '6h' }))
      .toBe(6 * 60 * 60_000);
  });

  it('still refuses a duration past the hard maximum, declaration or not', () => {
    expect(() => resolveChainBudget({
      declaredMs: DEFAULT_CHAIN_BUDGET_MS,
      declared: false,
      requested: '48h',
    })).toThrow();
  });

  it('falls back to two hours when nothing is declared and nothing is asked', () => {
    expect(resolveChainBudget({ declaredMs: DEFAULT_CHAIN_BUDGET_MS, declared: false }))
      .toBe(DEFAULT_CHAIN_BUDGET_MS);
  });

  it('keeps a written chainBudget a ceiling an invocation may only shorten', () => {
    const declaredMs = 2 * 60 * 60_000;

    expect(resolveChainBudget({ declaredMs, declared: true, requested: '30m' })).toBe(30 * 60_000);
    expect(() => resolveChainBudget({ declaredMs, declared: true, requested: '6h' }))
      .toThrow(/shorten/);
  });
});

describe('a unit that came back unmerged', () => {
  // Measured on 2026-09-02: 84 minutes for one unit that was published and
  // handed to a person, and the projection still said 15 minutes, because only
  // a merge counted as a measurement. The operator held the bound; the chain
  // exists so that nobody has to.
  it('still measures how long a unit takes here, and the cold estimate steps aside', () => {
    const decision = step({
      merged: [],
      taken: [{ tickets: ['DEV-1'], outcome: 'published-awaiting-human' }],
      postMerge: undefined,
      budgetMs: 120 * MINUTE,
      elapsedMs: 84 * MINUTE,
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('budget-spent');
      expect(decision.detail).toMatch(/1h24m/);
    }
  });

  it('stops while it waits for a person, rather than stacking a unit on the same base', () => {
    const decision = step({
      merged: [],
      taken: [{ tickets: ['DEV-1'], outcome: 'published-awaiting-human' }],
      postMerge: undefined,
      budgetMs: 120 * MINUTE,
      elapsedMs: 30 * MINUTE,
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') {
      expect(decision.reason).toBe('awaiting-human');
      expect(decision.failed).toBe(false);
      expect(decision.detail).toContain('DEV-1');
    }
  });

  it('lets a blocked unit hand back and the chain take the next one', () => {
    const decision = step({
      merged: [],
      taken: [{ tickets: ['DEV-1'], outcome: 'unit-blocked' }],
      postMerge: undefined,
      budgetMs: 120 * MINUTE,
      elapsedMs: 20 * MINUTE,
    });
    expect(decision.kind).toBe('continue');
  });

  it('keeps a fast failure from lowering the estimate under what any unit finished in', () => {
    // A unit blocked in two minutes measured how long failing takes, not how
    // long finishing does. Eight minutes left is still not a unit.
    const decision = step({
      merged: [],
      taken: [{ tickets: ['DEV-1'], outcome: 'unit-blocked' }],
      postMerge: undefined,
      budgetMs: 10 * MINUTE,
      elapsedMs: 2 * MINUTE,
    });
    expect(decision.kind).toBe('stop');
    if (decision.kind === 'stop') expect(decision.reason).toBe('budget-spent');
  });
});
