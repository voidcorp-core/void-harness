// Cost analysis (sub-project A): types for attributing token cost per harness
// component and flagging the ones that do not earn their place. Pure domain.
//
// Static cost (per-node source tokens x frequency) is exact and ships first.
// Real cost (transcript tokens, cache-aware, correlated per session, priced)
// rides on top in phase 2 via `sessionCosts` + `pricing` on CostOptions.

import type { NodeType } from '../model/types.js';

/** Cache-aware token breakdown for one session, aggregated from a transcript. */
export interface SessionTokens {
  readonly in: number;
  readonly out: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

/** One session's real cost, read from a Claude Code transcript JSONL (phase 2). */
export interface SessionCost {
  readonly sessionId: string;
  readonly model: string;
  readonly tokens: SessionTokens;
  readonly tsRange: { readonly first: string; readonly last: string };
}

/** Advisory flags. All severity:info — suggestions, never auto-applied (HITL). */
export type CostFlag = 'dead' | 'dead-hook' | 'underused' | 'expensive' | 'low-yield';

/** Median real-cost signal for a component: per-metric median across the
 * sessions where it fired (correlational, not causal). Absent in static-only mode. */
export interface RealSignal {
  readonly tokens: SessionTokens;
  /** Absent when the session's model is not in the pricing table. */
  readonly dollars?: number;
}

export interface CostRow {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: NodeType;
  readonly invocations: number;
  readonly staticTokens: number;
  /** Absent in static-only mode. */
  readonly realSignal?: RealSignal;
  /** Absent in static-only mode. */
  readonly cacheReadRatio?: number;
  readonly flags: readonly CostFlag[];
}

export interface CostStats {
  readonly events: number;
  readonly sessions: number;
  readonly skippedTranscriptLines: number;
}

export interface CostReport {
  readonly sufficient: boolean;
  readonly stats: CostStats;
  readonly rows: readonly CostRow[];
  readonly mode: 'static-only' | 'full';
}

export interface CostOptions {
  /** Absolute cutoff (epoch ms); activations older than this are excluded. */
  readonly sinceMs?: number;
  readonly minSessions?: number;
  readonly minEvents?: number;
  /** invocations in (0, underusedBelow) -> `underused`. Default 2. */
  readonly underusedBelow?: number;
  /** staticTokens >= this AND invocations <= 1 -> `low-yield`. Default 1500. */
  readonly lowYieldStaticMin?: number;
  /** Phase 2: real per-session costs, correlated to activations by sessionId. */
  readonly sessionCosts?: readonly SessionCost[];
  // Phase 2 also adds `pricing?: PricingTable` here (Step 5) — additive, no churn.
}
