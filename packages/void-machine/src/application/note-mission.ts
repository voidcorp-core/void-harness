// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import type { Clock, Execute } from '../runtime/execution.js';
import {
  type BlockedReason, type MissionReceipt as GenericReceipt, type MissionRunner, type MissionStore,
  abandonMission, cancelMission, resumeMission, startMission,
} from '../runtime/mission.js';
import type { Extraction, Note, NoteInput } from '../verticals/sourced-note/note.js';
import {
  type NoteValue, noteMissionDescription,
} from '../verticals/sourced-note/mission-codec.js';
import {
  configSchema, type MissionConfig, type MissionIssue, type MissionUsage, type Step,
} from '../verticals/sourced-note/mission-record.js';
import {
  type NoteStop, type StageOutcome, admitNoteRequest, extractStage, noteInputStop, synthesizeStage,
} from './note.js';

export type { MissionConfig, MissionUsage } from '../verticals/sourced-note/mission-record.js';
export type { BlockedReason, MissionStore } from '../runtime/mission.js';

export interface MissionRuntime {
  readonly extract: Execute;
  readonly synthesize: Execute;
  /** Usage observed since the previous call, attached to the step that produced it. */
  readonly drainUsage: () => readonly MissionUsage[];
}
export interface MissionDependencies extends MissionStore {
  /** Digest of instructions and output contracts the current code would dispatch. */
  readonly contract: string;
  readonly runtime: (config: MissionConfig) => MissionRuntime;
  readonly executionId: () => string;
  readonly clock: Clock;
}
export type BlockedReceipt = {
  readonly kind: 'blocked'; readonly missionId: string;
  readonly reason: BlockedReason; readonly diagnostic: string;
};
export type MissionReceipt =
  | { readonly kind: 'completed'; readonly missionId: string; readonly note: Note;
    readonly usage: readonly MissionUsage[] }
  | { readonly kind: 'paused'; readonly missionId: string; readonly stage: 'extraction';
    readonly usage: readonly MissionUsage[] }
  | (Omit<NoteStop, 'kind'> & { readonly kind: 'stopped'; readonly missionId: string;
    readonly usage: readonly MissionUsage[] })
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly stage: Step;
    readonly stop: 'confirmed'; readonly usage: readonly MissionUsage[] }
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly stage: Step;
    readonly stop: 'requested-unconfirmed'; readonly effect: 'unknown';
    readonly usage: readonly MissionUsage[] }
  | { readonly kind: 'cancelled'; readonly missionId: string; readonly stage: Step;
    readonly stop: 'late-result-discarded'; readonly usage: readonly MissionUsage[] }
  | { readonly kind: 'abandoned'; readonly missionId: string; readonly stage: Step;
    readonly effect: 'unknown' | 'late-result-discarded';
    readonly usage: readonly MissionUsage[] }
  | { readonly kind: 'rejected'; readonly missionId: string; readonly stage: Step;
    readonly usage: readonly MissionUsage[] }
  | BlockedReceipt;

type NoteRunner = MissionRunner<NoteInput, MissionConfig, Step,
  NoteValue, MissionIssue, MissionUsage>;
type NoteGenericReceipt = GenericReceipt<Step, NoteValue, MissionIssue, MissionUsage>;

function noteRunner(context: MissionDependencies): NoteRunner {
  return {
    contract: context.contract,
    executionId: context.executionId,
    execute: async (step, input, config, accepted, executionId) => {
      const runtime = context.runtime(config);
      const stage = { executionId, timeoutMs: config.timeoutMs, clock: context.clock };
      let outcome: StageOutcome<Extraction | Note>;
      switch (step) {
        case 'extraction':
          outcome = await extractStage(input, { ...stage, execute: runtime.extract });
          break;
        case 'synthesis': {
          // The reducer dispatches synthesis only after an admitted extraction.
          const prior = accepted.find((entry) => entry.step === 'extraction')?.value;
          if (prior?.kind !== 'extraction') return { kind: 'refused' };
          outcome = await synthesizeStage(input, prior.extraction,
            { ...stage, execute: runtime.synthesize });
          break;
        }
        default: { const neverStep: never = step; return neverStep; }
      }
      const usage = [...runtime.drainUsage()];
      if (outcome.kind === 'accepted') return { kind: 'accepted', value: outcome.value, usage };
      const unconfirmed = outcome.cancellation === 'requested-unconfirmed'
        || outcome.issue.code === 'execution.interrupted';
      return { kind: unconfirmed ? 'unconfirmed' : 'stopped', issue: outcome.issue,
        cancellation: outcome.cancellation, usage };
    },
  };
}

function noteReceipt(receipt: NoteGenericReceipt): MissionReceipt {
  switch (receipt.kind) {
    case 'completed':
      return receipt.value.kind === 'note'
        ? { kind: 'completed', missionId: receipt.missionId,
          note: receipt.value.note, usage: receipt.usage }
        : { kind: 'blocked', missionId: receipt.missionId, reason: 'unreadable',
          diagnostic: 'mission records are out of order' };
    case 'paused':
      return receipt.step === 'extraction'
        ? { kind: 'paused', missionId: receipt.missionId,
          stage: 'extraction', usage: receipt.usage }
        : { kind: 'blocked', missionId: receipt.missionId, reason: 'unreadable',
          diagnostic: 'mission records are out of order' };
    case 'stopped': {
      const { code, cause, owner, action } = receipt.issue;
      return { kind: 'stopped', missionId: receipt.missionId, stage: receipt.step,
        issue: { code, cause, owner, action }, cancellation: receipt.cancellation,
        usage: receipt.usage };
    }
    // The note receipt keeps its public `stage` field; the kernel names it `step`.
    case 'cancelled': {
      const { step, ...rest } = receipt;
      return { ...rest, stage: step };
    }
    case 'abandoned': {
      const { step, ...rest } = receipt;
      return { ...rest, stage: step };
    }
    case 'rejected': {
      const { step, ...rest } = receipt;
      return { ...rest, stage: step };
    }
    case 'blocked': return receipt;
    default: { const neverReceipt: never = receipt; return neverReceipt; }
  }
}

export async function startNoteMission(
  raw: unknown, config: MissionConfig, context: MissionDependencies,
  stopAfter?: 'extraction',
): Promise<MissionReceipt> {
  const request = admitNoteRequest(raw, config.timeoutMs);
  const parsedConfig = configSchema.safeParse(config);
  if (!request.ok || !parsedConfig.success) {
    const stop = noteInputStop();
    return { kind: 'stopped', missionId: context.missionId, stage: stop.stage,
      issue: stop.issue, cancellation: stop.cancellation, usage: [] };
  }
  return noteReceipt(await startMission(request.input, parsedConfig.data, context,
    noteMissionDescription, noteRunner(context), stopAfter));
}

export async function resumeNoteMission(context: MissionDependencies): Promise<MissionReceipt> {
  return noteReceipt(await resumeMission(context, noteMissionDescription, noteRunner(context)));
}

export async function cancelNoteMission(context: MissionStore): Promise<MissionReceipt> {
  return noteReceipt(await cancelMission(context, noteMissionDescription));
}

export async function abandonNoteMission(context: MissionStore): Promise<MissionReceipt> {
  return noteReceipt(await abandonMission(context, noteMissionDescription));
}
