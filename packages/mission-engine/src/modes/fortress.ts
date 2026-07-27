import type { MissionPlan } from '../mission/plan.js';
import {
  buildModeContract,
  type MissionModeContract,
  type ModeContractOptions,
} from './team.js';

export function fortressModeContract(
  plan: MissionPlan,
  options: ModeContractOptions = {},
): MissionModeContract {
  return buildModeContract(plan, 'fortress', options);
}
