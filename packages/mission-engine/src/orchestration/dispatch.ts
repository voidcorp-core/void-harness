import type { MissionPlan } from '../mission/plan.js';
import type {
  SpecialistId,
  SpecialistInvocationStage,
} from '../specialist/routing.js';
import type { MissionTeamAction } from './controller.js';

const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export type SpecialistDispatchRuntime = 'claude' | 'codex';
export type InvokeSpecialistsAction = Extract<
  MissionTeamAction,
  { readonly kind: 'invoke-specialists' }
>;

export interface SpecialistDispatchInput {
  readonly missionId: string;
  readonly runtime: SpecialistDispatchRuntime;
  readonly plan: MissionPlan;
  readonly action: InvokeSpecialistsAction;
  readonly currentInputHashes: Readonly<Record<string, string>>;
}

export interface SpecialistDispatchEnvelope {
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly runtime: SpecialistDispatchRuntime;
  readonly specialistId: SpecialistId;
  readonly agentName: string;
  readonly contractVersion: number;
  readonly stage: SpecialistInvocationStage;
  readonly reviewRound: number;
  readonly inputHash: string;
}

function invalid(detail: string): never {
  throw new Error(`SPECIALIST_DISPATCH_INVALID: ${detail}`);
}

/** Translate one controller decision into native-runtime handoffs. This function is
 * deliberately pure: the active Codex/Claude adapter owns the actual agent call. */
export function createSpecialistDispatch(
  input: SpecialistDispatchInput,
): readonly SpecialistDispatchEnvelope[] {
  if (!MISSION_ID.test(input.missionId)) invalid('missionId is invalid');
  if (input.runtime !== 'claude' && input.runtime !== 'codex') {
    invalid('runtime is invalid');
  }
  if (
    input.action.kind !== 'invoke-specialists'
    || (input.action.stage !== 'pre-implementation'
      && input.action.stage !== 'post-implementation')
    || !Number.isSafeInteger(input.action.reviewRound)
    || input.action.reviewRound < 1
    || input.action.reviewRound > 8
    || input.action.specialistIds.length < 1
    || input.action.specialistIds.length > 64
  ) {
    invalid('controller action is invalid');
  }
  const requested = new Set(input.action.specialistIds);
  if (requested.size !== input.action.specialistIds.length) {
    invalid('controller action contains duplicate specialists');
  }
  if (!Array.isArray(input.plan.specialists)) invalid('plan specialists are missing');

  const envelopes = input.action.specialistIds.map((specialistId) => {
    const matches = input.plan.specialists.filter((item) => item.specialistId === specialistId);
    const routed = matches[0];
    if (
      matches.length !== 1
      || routed === undefined
      || routed.state !== 'applicable'
      || !Array.isArray(routed.stages)
      || !routed.stages.includes(input.action.stage)
      || !Number.isSafeInteger(routed.contractVersion)
      || routed.contractVersion < 1
      || routed.contractVersion > 10_000
    ) {
      invalid(`specialist is not uniquely applicable for this stage: ${specialistId}`);
    }
    const inputHash = input.currentInputHashes[specialistId];
    if (inputHash === undefined || !SHA256.test(inputHash)) {
      invalid(`current input hash is missing or invalid: ${specialistId}`);
    }
    const agentName = specialistId.slice('core:'.length);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agentName)) {
      invalid(`agent name is invalid: ${specialistId}`);
    }
    return Object.freeze({
      schemaVersion: 1 as const,
      missionId: input.missionId,
      runtime: input.runtime,
      specialistId,
      agentName,
      contractVersion: routed.contractVersion,
      stage: input.action.stage,
      reviewRound: input.action.reviewRound,
      inputHash,
    });
  });
  return Object.freeze(envelopes);
}
