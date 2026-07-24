// Outcome telemetry (issue #71): the value side of the cost/value ledger. The
// PreToolUse records ATTEMPTS; PostToolUse/Stop records COMPLETIONS in the
// canonical per-mission journal (legacy split streams remain importable) — did
// a tool call succeed or error, and did the session end cleanly. Pure domain.

import type { ActivationKind } from '../behavior/types.js';

export type OutcomeStatus = 'ok' | 'error' | 'unknown';

/** One PostToolUse completion: a tool call that finished, with its status. */
export interface ToolOutcome {
  readonly event: 'PostToolUse';
  readonly ts: string;
  readonly kind: ActivationKind;
  readonly name: string;
  readonly status: OutcomeStatus;
  readonly sessionId: string;
}

/** One Stop event: the session ended (cleanly, from the agent's point of view). */
export interface SessionStop {
  readonly event: 'Stop';
  readonly ts: string;
  readonly sessionId: string;
}

export type OutcomeEvent = ToolOutcome | SessionStop;

/** Per-component completion tally, the raw material of a value/cost ratio. */
export interface ComponentOutcome {
  /** Completions seen (ok + error + unknown). */
  readonly completions: number;
  readonly ok: number;
  readonly error: number;
  /** ok / (ok + error); undefined when no ok/error completion is known. */
  readonly yield?: number;
}
