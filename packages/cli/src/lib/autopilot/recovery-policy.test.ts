import { describe, expect, it } from 'vitest';
import { beginRecovery, chooseStrategy, type RecoveryStrategy, recordRollback } from './recovery-policy.js';

const strategy = (over: Partial<RecoveryStrategy> = {}): RecoveryStrategy => ({ hypothesis: 'reduce-context', reversible: true, apiCeiling: 1, deployBranchChange: false, containsSecret: false, effectCost: 1, ...over });

describe('bounded recovery policy', () => {
  it('persists the selected deadline policy', () => {
    expect(beginRecovery(1_000, '15m')).toMatchObject({ phase: 'waiting', deadlineAtMs: 901_000, lastObservedAtMs: 1_000, attempts: 0 });
    expect(beginRecovery(1_000, '20m').deadlineAtMs).toBe(1_201_000);
  });

  it('expires once and refuses clock rollback', () => {
    const state = beginRecovery(1_000, '15m');
    expect(chooseStrategy(state, 900_999, strategy())).toMatchObject({ phase: 'waiting', attempts: 0 });
    expect(chooseStrategy(state, 901_000, strategy())).toMatchObject({ phase: 'recovering', attempts: 1 });
    expect(chooseStrategy(state, 999, strategy())).toMatchObject({ phase: 'blocked', reason: 'clock-rollback' });
  });

  it('allows three distinct hypotheses and refuses repeats or a fourth attempt', () => {
    let state = chooseStrategy(beginRecovery(0, '15m'), 900_000, strategy());
    state = chooseStrategy(state, 900_001, strategy({ hypothesis: 'narrow-surface' }));
    state = chooseStrategy(state, 900_002, strategy({ hypothesis: 'rebuild-cache' }));
    expect(state).toMatchObject({ phase: 'recovering', attempts: 3 });
    expect(chooseStrategy(state, 900_003, strategy({ hypothesis: 'last-chance' }))).toMatchObject({ phase: 'blocked', reason: 'attempt-ceiling' });
    expect(chooseStrategy(state, 900_003, strategy({ hypothesis: 'rebuild-cache' }))).toMatchObject({ phase: 'blocked', reason: 'repeated-hypothesis' });
  });

  it('refuses unsafe strategies before any effect is authorized', () => {
    const state = beginRecovery(0, '15m');
    for (const candidate of [strategy({ reversible: false }), strategy({ apiCeiling: 0 }), strategy({ deployBranchChange: true }), strategy({ containsSecret: true }), strategy({ effectCost: 0 })]) {
      expect(chooseStrategy(state, 900_000, candidate)).toMatchObject({ phase: 'blocked', reason: 'unsafe-strategy' });
    }
  });

  it('blocks on failed rollback and completes only with rollback evidence', () => {
    const state = chooseStrategy(beginRecovery(0, '15m'), 900_000, strategy());
    expect(recordRollback(state, { ok: false, evidence: 'rollback failed' })).toMatchObject({ phase: 'blocked', reason: 'rollback-failed' });
    expect(recordRollback(state, { ok: true, evidence: 'reverted effect-1' })).toMatchObject({ phase: 'completed', rollbackEvidence: 'reverted effect-1' });
  });
});
