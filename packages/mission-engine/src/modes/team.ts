import type { MissionPlan } from '../mission/plan.js';
import type { MissionPassId } from '../policy/schema.js';

export type MissionMode = 'fast' | 'team' | 'fortress';
export type OptionalRedundancy = 'reduced' | 'standard' | 'expanded';
export type FortressAssuranceRequirement =
  | 'threat-model'
  | 'adversarial-security-review'
  | 'rollback-recovery-proof'
  | 'safe-dast-when-executable'
  | 'critical-invariant-second-proof';

export interface ModePromotion {
  readonly from: MissionMode;
  readonly to: MissionMode;
  readonly reason: 'high-risk-predicate' | 'risk-not-explicitly-low';
  readonly predicateIds: readonly string[];
}

export interface MissionModeSelection {
  readonly requestedMode: MissionMode;
  readonly effectiveMode: MissionMode;
  readonly promotion?: ModePromotion;
}

export interface MissionModeContract {
  readonly schemaVersion: 1;
  readonly requestedMode: MissionMode;
  readonly effectiveMode: MissionMode;
  readonly evaluatedPasses: readonly MissionPassId[];
  readonly requiredPasses: readonly MissionPassId[];
  readonly requiresNativeSubagents: boolean;
  readonly requiresFreshReviewContext: boolean;
  readonly optionalRedundancy: OptionalRedundancy;
  readonly assuranceRequirements: readonly FortressAssuranceRequirement[];
  readonly promotion?: ModePromotion;
}

export interface ModeContractOptions {
  readonly requestedMode?: MissionMode;
  readonly promotion?: ModePromotion;
}

export function buildModeContract(
  plan: MissionPlan,
  effectiveMode: MissionMode,
  options: ModeContractOptions = {},
): MissionModeContract {
  const evaluatedPasses = Object.freeze(
    plan.applicability.map((item) => item.pass),
  );
  const requiredPasses = Object.freeze(
    plan.applicability
      .filter((item) => item.state === 'pending')
      .map((item) => item.pass),
  );
  const assuranceRequirements = effectiveMode === 'fortress'
    ? Object.freeze([
        'threat-model',
        'adversarial-security-review',
        'rollback-recovery-proof',
        'safe-dast-when-executable',
        'critical-invariant-second-proof',
      ] as const)
    : Object.freeze([]);
  return Object.freeze({
    schemaVersion: 1,
    requestedMode: options.requestedMode ?? effectiveMode,
    effectiveMode,
    evaluatedPasses,
    requiredPasses,
    requiresNativeSubagents: effectiveMode !== 'fast',
    requiresFreshReviewContext: effectiveMode !== 'fast',
    optionalRedundancy: effectiveMode === 'fast'
      ? 'reduced'
      : effectiveMode === 'fortress' ? 'expanded' : 'standard',
    assuranceRequirements,
    ...(options.promotion === undefined
      ? {}
      : { promotion: Object.freeze(options.promotion) }),
  });
}

export function teamModeContract(plan: MissionPlan): MissionModeContract {
  return buildModeContract(plan, 'team');
}
