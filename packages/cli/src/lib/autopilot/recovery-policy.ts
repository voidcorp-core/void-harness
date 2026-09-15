export type RecoveryPolicy = '15m' | '20m';
export type RecoveryPhase = 'waiting' | 'recovering' | 'blocked' | 'completed';
export type RecoveryBlock = 'clock-rollback' | 'attempt-ceiling' | 'repeated-hypothesis' | 'unsafe-strategy' | 'rollback-failed';
export interface RecoveryStrategy { readonly hypothesis: string; readonly reversible: boolean; readonly apiCeiling: number; readonly deployBranchChange: boolean; readonly containsSecret: boolean; readonly effectCost: number; }
export interface RecoveryState { readonly schemaVersion: 1; readonly phase: RecoveryPhase; readonly startedAtMs: number; readonly deadlineAtMs: number; readonly lastObservedAtMs: number; readonly attempts: number; readonly hypotheses: readonly string[]; readonly rollbackEvidence?: string; readonly reason?: RecoveryBlock; }

const POLICY_MS: Readonly<Record<RecoveryPolicy, number>> = { '15m': 15 * 60 * 1_000, '20m': 20 * 60 * 1_000 };
const validTime = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export const beginRecovery = (startedAtMs: number, policy: RecoveryPolicy): RecoveryState => {
  if (!validTime(startedAtMs)) throw new Error('recovery start time is invalid');
  return { schemaVersion: 1, phase: 'waiting', startedAtMs, deadlineAtMs: startedAtMs + POLICY_MS[policy], lastObservedAtMs: startedAtMs, attempts: 0, hypotheses: [] };
};

const blocked = (state: RecoveryState, reason: RecoveryBlock): RecoveryState => ({ ...state, phase: 'blocked', reason });
const safeStrategy = (value: RecoveryStrategy): boolean => value.hypothesis.length > 0 && value.reversible && value.apiCeiling > 0 && !value.deployBranchChange && !value.containsSecret && value.effectCost > 0;

export const chooseStrategy = (state: RecoveryState, nowMs: number, strategy: RecoveryStrategy): RecoveryState => {
  if (!validTime(nowMs) || nowMs < state.lastObservedAtMs) return blocked(state, 'clock-rollback');
  const observed = { ...state, lastObservedAtMs: nowMs };
  if (state.phase === 'blocked' || state.phase === 'completed') return observed;
  if (nowMs < state.deadlineAtMs) return observed;
  if (!safeStrategy(strategy)) return blocked(observed, 'unsafe-strategy');
  if (state.hypotheses.includes(strategy.hypothesis)) return blocked(observed, 'repeated-hypothesis');
  if (state.attempts >= 3) return blocked(observed, 'attempt-ceiling');
  return { ...observed, phase: 'recovering', attempts: state.attempts + 1, hypotheses: [...state.hypotheses, strategy.hypothesis] };
};

export const recordRollback = (state: RecoveryState, rollback: { readonly ok: boolean; readonly evidence: string }): RecoveryState => {
  if (!rollback.evidence) return blocked(state, 'rollback-failed');
  if (!rollback.ok) return { ...blocked(state, 'rollback-failed'), rollbackEvidence: rollback.evidence };
  return { ...state, phase: 'completed', rollbackEvidence: rollback.evidence };
};
