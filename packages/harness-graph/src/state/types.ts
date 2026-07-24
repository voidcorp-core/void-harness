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
  /** Executable local postconditions passed for at least one compatible runtime. */
  readonly verified: boolean;
  /** Frozen release proof carried from the certification, independent of local installation. */
  readonly certified: boolean;
  /** How many times it fired in local mission telemetry. 0 = never used here. */
  readonly usedCount: number;
  /** The certified effective cells, present only when the project state reached `effective`. */
  readonly effectiveCells?: readonly EffectiveCell[];
}

/** Whether a runtime the harness targets is set up in this project. */
export interface RuntimeState {
  readonly runtime: string;
  /** Compatibility projection. True only when installation is positively observed. */
  readonly detected: boolean;
  readonly evidence: RuntimeEvidence;
}

/** Tri-state runtime postconditions. `null` means the signal was not measured, never success. */
export interface RuntimeEvidence {
  readonly installed: boolean | null;
  readonly wired: boolean | null;
  readonly fired: boolean | null;
  readonly observed: boolean | null;
  readonly certified: boolean | null;
}

/** The local, deterministic inputs the pure core joins with the frozen certification. The imperative
 * shell (the `status` command) builds this by reading files; the core never does I/O. */
export interface LocalSignals {
  /** Capability ids materially present in at least one installed runtime. */
  readonly installedIds: ReadonlySet<string>;
  /** Capability ids whose compatible runtime passed executable wiring + hook postconditions. */
  readonly verifiedIds: ReadonlySet<string>;
  /** Invocation count per capability id, from local telemetry. Keyed by id (shell maps name -> id). */
  readonly usedCounts: ReadonlyMap<string, number>;
  /** Explicit runtime evidence. Missing keys and null fields remain unknown. */
  readonly runtimeEvidence: ReadonlyMap<string, RuntimeEvidence>;
}

/** The deterministic, offline, LLM-free project snapshot. Persisted at `.void/state.json`. */
export interface ProjectState {
  readonly schemaVersion: 1;
  readonly harnessVersion: string;
  readonly capabilities: readonly CapabilityState[];
  readonly runtimes: readonly RuntimeState[];
}

/** A **blocker** caps the global score at 69 when its `red` failure-predicate fires (a real defect —
 * never a merely-low score, so a structural limit like Hermes `ci-only` never caps). A **gauge** is a
 * maturity gradient that contributes proportionally and can never cap ("new is not broken"). */
export type DimensionKind = 'blocker' | 'gauge';

/** One scored dimension. A **pending** score (no honest local signal yet) is excluded from the global
 * mean rather than invented; it serializes explicitly so the artifact reads "measured: pending", not
 * "field forgotten". `red` is meaningful only for blockers. */
export interface Dimension {
  readonly key: string;
  readonly kind: DimensionKind;
  readonly score: number | null; // allow-null: JSON artifact — the explicit pending marker must survive serialization (undefined would drop it)
  readonly red?: boolean;
  readonly detail?: string;
  readonly perRuntime?: Readonly<Record<string, number>>;
}

/** How much of the score rests on real proof vs assumption — driven by eval coverage + telemetry volume. */
export type ScoreConfidence = 'low' | 'medium' | 'high';

/** A recommended move, ranked by the global-score points it would unlock. */
export interface NextAction {
  readonly rank: number;
  readonly title: string;
  readonly impact: number;
}

/** The composite score: never a naive mean — a red blocker caps it at 69, and unmeasured dimensions
 * are excluded, not invented. Carries a confidence band and impact-ranked next actions. */
export interface Score {
  readonly global: number;
  readonly confidence: ScoreConfidence;
  readonly capped: boolean;
  readonly blockers: readonly string[];
  readonly dimensions: readonly Dimension[];
  readonly nextActions: readonly NextAction[];
}

export type { Certification };
