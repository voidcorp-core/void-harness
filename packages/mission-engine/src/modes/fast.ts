import type { MissionPlan } from '../mission/plan.js';
import type { RiskClassification } from '../risk/classify.js';
import { fortressModeContract } from './fortress.js';
import {
  buildModeContract,
  teamModeContract,
  type MissionModeContract,
  type MissionMode,
  type MissionModeSelection,
  type ModePromotion,
} from './team.js';

function promotionFor(
  risk: RiskClassification,
  from: MissionMode,
  to: ModePromotion['to'],
  reason: ModePromotion['reason'],
): ModePromotion {
  return Object.freeze({
    from,
    to,
    reason,
    predicateIds: Object.freeze(
      risk.reasons.map((item) => item.predicateId),
    ),
  });
}

export function selectMissionMode(
  risk: RiskClassification,
  requestedMode: MissionMode,
): MissionModeSelection {
  if (risk.level === 'high' && requestedMode !== 'fortress') {
    return Object.freeze({
      requestedMode,
      effectiveMode: 'fortress',
      promotion: promotionFor(
        risk,
        requestedMode,
        'fortress',
        'high-risk-predicate',
      ),
    });
  }
  if (requestedMode === 'fast' && risk.level !== 'low') {
    return Object.freeze({
      requestedMode,
      effectiveMode: 'team',
      promotion: promotionFor(
        risk,
        'fast',
        'team',
        'risk-not-explicitly-low',
      ),
    });
  }
  return Object.freeze({ requestedMode, effectiveMode: requestedMode });
}

export function resolveFastMode(plan: MissionPlan): MissionModeContract {
  return resolveMissionMode(plan, 'fast');
}

export function resolveMissionMode(
  plan: MissionPlan,
  requestedMode: MissionMode,
): MissionModeContract {
  const selection = selectMissionMode(plan.risk, requestedMode);
  if (selection.effectiveMode === 'fortress') {
    return fortressModeContract(plan, {
      requestedMode,
      ...(selection.promotion === undefined
        ? {}
        : { promotion: selection.promotion }),
    });
  }
  if (selection.effectiveMode === 'team') {
    const contract = teamModeContract(plan);
    return Object.freeze({
      ...contract,
      requestedMode,
      ...(selection.promotion === undefined
        ? {}
        : { promotion: selection.promotion }),
    });
  }
  return buildModeContract(plan, selection.effectiveMode, { requestedMode });
}
