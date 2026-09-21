// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import { z } from 'zod';
import type { Clock, Execute } from '../runtime/execution.js';
import type { MissionJournal } from '../runtime/journal.js';
import {
  type Note, admitExtraction, admitNote, noteInputSchema,
} from '../verticals/sourced-note/note.js';
import {
  type NoteStop, type StageOutcome, admitNoteRequest, extractStage, noteInputStop, synthesizeStage,
} from './note.js';

const FORMAT = 'void-machine.note-mission/1';
const step = z.enum(['extraction', 'synthesis']);
const usage = z.array(z.record(z.string(), z.unknown())).max(4);
const issue = z.strictObject({
  code: z.string().min(1).max(200), cause: z.string().min(1).max(2000),
  owner: z.enum(['caller', 'extractor', 'synthesizer']), action: z.string().min(1).max(2000),
});
const cancellation = z.enum(['not-requested', 'requested-unconfirmed']);
const configSchema = z.strictObject({
  extractionModel: z.string().min(1).max(200),
  synthesisModel: z.string().min(1).max(200),
  timeoutMs: z.number().int().min(1).max(2_147_483_647),
});
const envelope = { format: z.literal(FORMAT), revision: z.number().int().min(1).max(16) };
// Values produced by the vertical are stored as received and re-admitted on every read.
const recordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...envelope, kind: z.literal('started'), input: noteInputSchema,
    config: configSchema, contract: z.string().min(1).max(200) }),
  z.strictObject({ ...envelope, kind: z.literal('dispatched'), step, executionId: z.string().min(1).max(200) }),
  z.strictObject({ ...envelope, kind: z.literal('accepted'), step: z.literal('extraction'), value: z.unknown(), usage }),
  z.strictObject({ ...envelope, kind: z.literal('unconfirmed'), step, issue, cancellation, usage }),
  z.strictObject({ ...envelope, kind: z.literal('stopped'), stage: step, issue, cancellation, usage }),
  z.strictObject({ ...envelope, kind: z.literal('completed'), note: z.unknown(), usage }),
]);
type MissionRecord = z.infer<typeof recordSchema>;
type Started = Extract<MissionRecord, { kind: 'started' }>;
type Body = MissionRecord extends infer R ? R extends MissionRecord ? Omit<R, 'format' | 'revision'> : never : never;
type Step = z.infer<typeof step>;

export type MissionConfig = z.infer<typeof configSchema>;
export type MissionUsage = Readonly<Record<string, unknown>>;
export interface MissionRuntime {
  readonly extract: Execute;
  readonly synthesize: Execute;
  /** Usage observed since the previous call, attached to the step that produced it. */
  readonly drainUsage: () => readonly MissionUsage[];
}
export interface MissionDependencies {
  readonly journal: MissionJournal;
  readonly missionId: string;
  /** Digest of instructions and output contracts the current code would dispatch. */
  readonly contract: string;
  readonly runtime: (config: MissionConfig) => MissionRuntime;
  readonly executionId: () => string;
  readonly clock: Clock;
}
export type BlockedReason = 'missing' | 'conflict' | 'storage' | 'unrecordable' | 'unreadable'
  | 'incompatible' | 'context-changed' | 'inadmissible' | 'outcome-unknown';
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
  | BlockedReceipt;

type Position =
  | { readonly kind: 'dispatch'; readonly step: 'extraction' }
  | { readonly kind: 'dispatch'; readonly step: 'synthesis'; readonly extraction: unknown }
  | { readonly kind: 'unknown' } | { readonly kind: 'settled' } | { readonly kind: 'invalid' };
type Written = { readonly kind: 'written'; readonly records: readonly MissionRecord[] } | BlockedReceipt;

function blocked(missionId: string, reason: BlockedReason, diagnostic: string): BlockedReceipt {
  return { kind: 'blocked', missionId, reason, diagnostic };
}

// Same receipt at first observation and on every resume: the step's fate is not known.
function unknownOutcome(missionId: string): BlockedReceipt {
  return blocked(missionId, 'outcome-unknown',
    'A dispatched step has no accepted outcome; its result and cost are unknown and it is not launched again');
}

/** Pure: where the recorded mission stands. A dispatch without outcome is never replayed. */
function position(records: readonly MissionRecord[]): Position {
  const [first, ...rest] = records;
  if (first?.kind !== 'started') return { kind: 'invalid' };
  let expected: Position = { kind: 'dispatch', step: 'extraction' };
  let inFlight: Step | undefined;
  for (const record of rest) {
    if (expected.kind !== 'dispatch') return { kind: 'invalid' };
    if (record.kind === 'dispatched') {
      if (inFlight !== undefined || record.step !== expected.step) return { kind: 'invalid' };
      inFlight = record.step;
      continue;
    }
    const current = inFlight;
    inFlight = undefined;
    if (record.kind === 'accepted' && current === 'extraction') {
      expected = { kind: 'dispatch', step: 'synthesis', extraction: record.value };
    } else if ((record.kind === 'completed' && current === 'synthesis')
      || (record.kind === 'stopped' && record.stage === current)) {
      expected = { kind: 'settled' };
    } else if (record.kind === 'unconfirmed' && record.step === current) {
      expected = { kind: 'unknown' };
    } else return { kind: 'invalid' };
  }
  return inFlight === undefined ? expected : { kind: 'unknown' };
}

function parseRecords(raw: readonly unknown[], missionId: string): Written {
  const records: MissionRecord[] = [];
  for (const [index, value] of raw.entries()) {
    const parsed = recordSchema.safeParse(value);
    const format = typeof value === 'object' && value !== null && 'format' in value ? value.format : undefined;
    const where = `revision ${String(index + 1)}`;
    if (typeof format === 'string' && format !== FORMAT) {
      return blocked(missionId, 'incompatible', `${where}: unsupported record format`);
    }
    if (!parsed.success || parsed.data.revision !== index + 1) {
      return blocked(missionId, 'unreadable', `${where}: record does not match ${FORMAT}`);
    }
    records.push(parsed.data);
  }
  return { kind: 'written', records };
}

async function write(context: MissionDependencies, records: readonly MissionRecord[],
  body: Body): Promise<Written> {
  const record: MissionRecord = { format: FORMAT, revision: records.length + 1, ...body };
  const revision = String(record.revision);
  // A record the reader would refuse is never written: it would block the mission for good.
  if (!recordSchema.safeParse(record).success) {
    return blocked(context.missionId, 'unrecordable', `Revision ${revision} does not match ${FORMAT}; nothing was written`);
  }
  const result = await context.journal.append(context.missionId, records.length, record);
  if (result.kind === 'appended') return { kind: 'written', records: [...records, record] };
  if (result.kind === 'conflict') {
    return blocked(context.missionId, 'conflict', `Another writer recorded revision ${revision} first; no further step will be launched by this process`);
  }
  if (result.kind === 'unconfirmed') {
    return blocked(context.missionId, 'storage',
      `Revision ${revision} was linked but its durability is unconfirmed (${result.reason}); no further step will be launched by this process`);
  }
  return blocked(context.missionId, 'storage', `Revision ${revision} was not recorded (${result.reason}); no further step will be launched by this process`);
}

function usageOf(records: readonly MissionRecord[]): MissionUsage[] {
  return records.flatMap((record) => 'usage' in record ? record.usage : []);
}

/** Renders the deliverable from records only, so a later resume returns identical bytes. */
function settle(records: readonly MissionRecord[], missionId: string): MissionReceipt {
  const [started] = records;
  const last = records.at(-1);
  if (started?.kind !== 'started' || last === undefined) {
    return blocked(missionId, 'unreadable', 'mission records are out of order');
  }
  if (last.kind === 'completed') {
    const note = admitNote(last.note, started.input);
    return note.ok ? { kind: 'completed', missionId, note: note.value, usage: usageOf(records) }
      : blocked(missionId, 'inadmissible', 'The recorded note is not admissible for the recorded request');
  }
  if (last.kind === 'unconfirmed') return unknownOutcome(missionId);
  if (last.kind === 'stopped') {
    // Explicit key order: an in-memory issue and a parsed one render the same bytes.
    const { code, cause, owner, action } = last.issue;
    return { kind: 'stopped', missionId, stage: last.stage,
      issue: { code, cause, owner, action }, cancellation: last.cancellation, usage: usageOf(records) };
  }
  return blocked(missionId, 'unreadable', 'mission records are out of order');
}

function outcomeBody(current: Step, outcome: StageOutcome<unknown>, observed: MissionUsage[]): Body {
  if (outcome.kind === 'accepted') {
    return current === 'extraction'
      ? { kind: 'accepted', step: 'extraction', value: outcome.value, usage: observed }
      : { kind: 'completed', note: outcome.value, usage: observed };
  }
  const { issue: stopIssue, cancellation: stopCancellation } = outcome;
  // A requested but unconfirmed cancellation leaves the native effect's fate unknown.
  const unconfirmed = stopCancellation === 'requested-unconfirmed' || stopIssue.code === 'execution.interrupted';
  return unconfirmed
    ? { kind: 'unconfirmed', step: current, issue: stopIssue, cancellation: stopCancellation, usage: observed }
    : { kind: 'stopped', stage: current, issue: stopIssue, cancellation: stopCancellation, usage: observed };
}

async function dispatch(context: MissionDependencies, records: readonly MissionRecord[],
  next: Extract<Position, { kind: 'dispatch' }>, started: Started): Promise<Written> {
  const extraction = next.step === 'synthesis' ? admitExtraction(next.extraction, started.input) : undefined;
  if (extraction?.ok === false) {
    return blocked(context.missionId, 'inadmissible', 'The recorded extraction is not admissible for the recorded request');
  }
  const executionId = context.executionId();
  const intent = await write(context, records, { kind: 'dispatched', step: next.step, executionId });
  if (intent.kind === 'blocked') return intent;
  const runtime = context.runtime(started.config);
  const stage = { executionId, timeoutMs: started.config.timeoutMs, clock: context.clock };
  const outcome: StageOutcome<unknown> = extraction === undefined
    ? await extractStage(started.input, { ...stage, execute: runtime.extract })
    : await synthesizeStage(started.input, extraction.value, { ...stage, execute: runtime.synthesize });
  return write(context, intent.records, outcomeBody(next.step, outcome, [...runtime.drainUsage()]));
}

async function advance(context: MissionDependencies, initial: readonly MissionRecord[],
  stopAfter: 'extraction' | undefined): Promise<MissionReceipt> {
  let records = initial;
  // Two steps at most, then one final inspection of what was recorded.
  for (let turn = 0; turn <= 2; turn += 1) {
    const next = position(records);
    const [started] = records;
    if (next.kind === 'invalid' || started?.kind !== 'started') {
      return blocked(context.missionId, 'unreadable', 'mission records are out of order');
    }
    if (next.kind === 'unknown') return unknownOutcome(context.missionId);
    if (next.kind === 'settled') return settle(records, context.missionId);
    if (started.contract !== context.contract) {
      return blocked(context.missionId, 'context-changed',
        'The recorded execution contract differs from the current one; nothing was launched');
    }
    const written = await dispatch(context, records, next, started);
    if (written.kind === 'blocked') return written;
    records = written.records;
    if (records.at(-1)?.kind !== 'accepted') return settle(records, context.missionId);
    if (stopAfter === 'extraction') {
      return { kind: 'paused', missionId: context.missionId, stage: 'extraction', usage: usageOf(records) };
    }
  }
  return blocked(context.missionId, 'unreadable', 'mission exceeded its step bound');
}

export async function startNoteMission(raw: unknown, config: MissionConfig, context: MissionDependencies,
  stopAfter?: 'extraction'): Promise<MissionReceipt> {
  const request = admitNoteRequest(raw, config.timeoutMs);
  const parsedConfig = configSchema.safeParse(config);
  if (!request.ok || !parsedConfig.success) {
    // Nothing is recorded for a request that was never admitted.
    const stop = noteInputStop();
    return { kind: 'stopped', missionId: context.missionId, stage: stop.stage, issue: stop.issue,
      cancellation: stop.cancellation, usage: [] };
  }
  const started = await write(context, [], { kind: 'started', input: request.input,
    config: parsedConfig.data, contract: context.contract });
  if (started.kind === 'blocked') return started;
  return advance(context, started.records, stopAfter);
}

export async function resumeNoteMission(context: MissionDependencies): Promise<MissionReceipt> {
  const read = await context.journal.read(context.missionId);
  if (read.kind === 'missing') return blocked(context.missionId, 'missing', 'No mission is recorded under this identifier');
  if (read.kind === 'unreadable') return blocked(context.missionId, 'unreadable', read.reason);
  const parsed = parseRecords(read.records, context.missionId);
  if (parsed.kind === 'blocked') return parsed;
  return advance(context, parsed.records, undefined);
}
