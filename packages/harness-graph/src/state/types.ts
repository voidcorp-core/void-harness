import type { Certification, EffectiveCell } from '../certification/types.js';

/** The five-state capability lifecycle (spec §2). Linear: each level implies the ones before it. */
export type CapabilityStateName = 'available' | 'installed' | 'verified' | 'used' | 'effective';

/**
 * One capability's state in *this* project: the frozen proof joined with local reality.
 *
 * Invariant (enforced by construction in `computeProjectState`, not the type): `effectiveCells` is
 * present iff `state === 'effective'`. Kept a flat interface rather than a discriminated union on
 * `state` deliberately — every consumer *reads* this shape (score, renderer), only the single tested
 * producer constructs it, so a DU would add read-site friction for no real illegal-state protection.
 */
export interface CapabilityState {
  readonly id: string;
  readonly state: CapabilityStateName;
  /** Structural proof carried from the certification (`proof.verified`). Note: independent of local
   * install — an `available` (not-installed-here) capability can still carry the repo's `verified`. */
  readonly verified: boolean;
  /** How many times it fired here (from `.void/activations.jsonl`), a non-negative integer. 0 = never used here. */
  readonly usedCount: number;
  /** The certified effective cells, present only when the project state reached `effective`. */
  readonly effectiveCells?: readonly EffectiveCell[];
}

/** Whether a runtime the harness targets is set up in this project. */
export interface RuntimeState {
  readonly runtime: string;
  readonly detected: boolean;
}

/** The local, deterministic inputs the pure core joins with the frozen certification. The imperative
 * shell (the `status` command) builds this by reading files; the core never does I/O. */
export interface LocalSignals {
  /** Capability ids present in this project (all shipped capabilities in the harness repo itself). */
  readonly installedIds: ReadonlySet<string>;
  /** Invocation count per capability id, from local telemetry. Keyed by id (shell maps name -> id). */
  readonly usedCounts: ReadonlyMap<string, number>;
  /** Runtimes detected as set up here (e.g. claude if CLAUDE.md, codex if AGENTS.md). */
  readonly runtimesDetected: ReadonlySet<string>;
}

/** The deterministic, offline, LLM-free project snapshot. Persisted at `.void/state.json`. */
export interface ProjectState {
  readonly schemaVersion: 1;
  readonly harnessVersion: string;
  readonly capabilities: readonly CapabilityState[];
  readonly runtimes: readonly RuntimeState[];
}

export type { Certification };
