import type { EvalTarget, NodeEnforcement } from '../model/types.js';

/** The subset of an eval-harness `EvalReport` the certification join needs (skill name + verdict +
 * effect size). Read from `apps/eval-harness/reports/<skill>.json`. */
export interface EvalReportLite {
  readonly skill: string;
  readonly delta: number;
  readonly verdict: 'skill-helps' | 'no-signal' | 'skill-hurts';
}

/** An `(runtime, provider, tier)` cell a capability is proven `effective` on, with its measured delta. */
export interface EffectiveCell extends EvalTarget {
  readonly delta: number;
}

/** The frozen proof status of a capability at release time (spec §2, five-state model). `verified`
 * is structural (owner + runtimes declared); `effective` exists only when a real eval report says so. */
export interface ProofRecord {
  readonly verified: boolean;
  readonly effective?: { readonly cells: readonly EffectiveCell[] };
}

/** One capability's frozen certification: its declared contract plus the proof derived from evals. */
export interface CapabilityCert {
  readonly id: string;
  readonly owner?: string;
  readonly runtimes: readonly string[];
  readonly enforcement?: NodeEnforcement;
  readonly evalTargets: readonly EvalTarget[];
  readonly proof: ProofRecord;
}

/** The per-release certification manifest: frozen into the artifact, read by ProjectState (Phase B)
 * and never recomputed on a consumer machine. */
export interface Certification {
  readonly schemaVersion: 1;
  readonly harnessVersion: string;
  readonly capabilities: readonly CapabilityCert[];
}
