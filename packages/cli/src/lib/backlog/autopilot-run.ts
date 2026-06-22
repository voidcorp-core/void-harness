// The launcher's pure helpers: the budget circuit breaker (M7) and the operator
// views over the run state (status / explain-blocked). The L0 loop itself — pull
// pool, confirm, drive the Workflow per cluster, compact between clusters — lives
// in the skill (it needs the MCP and the Workflow tool, not unit-testable here).

import type { RunState } from './run-state.js';

export interface Budget {
  readonly maxTokens?: number;
  readonly maxMs?: number;
}

export interface Spent {
  readonly tokens: number;
  readonly ms: number;
}

export interface BreakerResult {
  readonly stop: boolean;
  readonly reason?: string;
}

/**
 * Stop the run cleanly when a budget ceiling is reached (so a multi-hour Opus run
 * cannot silently exhaust the human's rate limits). An unset ceiling never stops.
 */
export function budgetBreaker(spent: Spent, budget: Budget): BreakerResult {
  if (budget.maxTokens !== undefined && spent.tokens >= budget.maxTokens) {
    return { stop: true, reason: `token budget reached (${spent.tokens}/${budget.maxTokens})` };
  }
  if (budget.maxMs !== undefined && spent.ms >= budget.maxMs) {
    return { stop: true, reason: `time budget reached (${spent.ms}/${budget.maxMs}ms)` };
  }
  return { stop: false };
}

export interface ClusterLine {
  readonly id: string;
  readonly status: string;
  readonly pr?: string;
}

export interface RunSummary {
  readonly merged: number;
  readonly prOpen: number;
  readonly blocked: number;
  readonly pending: number;
  readonly clusters: readonly ClusterLine[];
}

export function summarizeRun(state: RunState): RunSummary {
  const count = (s: string): number => state.clusters.filter((c) => c.status === s).length;
  return {
    merged: count('merged'),
    prOpen: count('pr-open'),
    blocked: count('blocked'),
    pending: count('pending') + count('in-progress'),
    clusters: state.clusters.map((c) => (c.pr !== undefined ? { id: c.id, status: c.status, pr: c.pr } : { id: c.id, status: c.status })),
  };
}

export interface BlockedCluster {
  readonly id: string;
  readonly reason: string;
}

export function blockedClusters(state: RunState): readonly BlockedCluster[] {
  return state.clusters
    .filter((c) => c.status === 'blocked')
    .map((c) => ({ id: c.id, reason: c.detail ?? 'no detail recorded' }));
}
