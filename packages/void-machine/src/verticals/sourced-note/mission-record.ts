// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import { z } from 'zod';
import { noteInputSchema } from './note.js';

// Historical kinds keep the first format, so a mission never cancelled keeps its bytes and
// an older binary still reads it. Cancellation kinds exist only in the second format, which
// that binary refuses as incompatible instead of misreading.
export const FORMAT = 'void-machine.note-mission/1';
export const CANCELLATION_FORMAT = 'void-machine.note-mission/2';
export const CANCELLATION_KINDS: ReadonlySet<string> = new Set([
  'cancelled', 'cancel-requested', 'abandoned',
]);
const step = z.enum(['extraction', 'synthesis']);
const usage = z.array(z.record(z.string(), z.unknown())).max(4);
const issue = z.strictObject({
  code: z.string().min(1).max(200), cause: z.string().min(1).max(2000),
  owner: z.enum(['caller', 'extractor', 'synthesizer']), action: z.string().min(1).max(2000),
});
const cancellation = z.enum(['not-requested', 'requested-unconfirmed']);
export const configSchema = z.strictObject({
  extractionModel: z.string().min(1).max(200),
  synthesisModel: z.string().min(1).max(200),
  timeoutMs: z.number().int().min(1).max(2_147_483_647),
});
const revisionField = z.number().int().min(1).max(16);
const envelope = { format: z.literal(FORMAT), revision: revisionField };
const cancellationEnvelope = { format: z.literal(CANCELLATION_FORMAT), revision: revisionField };
// Values produced by the vertical are stored as received and re-admitted on every read.
export const recordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...envelope, kind: z.literal('started'), input: noteInputSchema,
    config: configSchema, contract: z.string().min(1).max(200) }),
  z.strictObject({ ...envelope, kind: z.literal('dispatched'),
    step, executionId: z.string().min(1).max(200) }),
  z.strictObject({ ...envelope, kind: z.literal('accepted'),
    step: z.literal('extraction'), value: z.unknown(), usage }),
  z.strictObject({ ...envelope, kind: z.literal('unconfirmed'), step, issue, cancellation, usage }),
  z.strictObject({ ...envelope, kind: z.literal('stopped'),
    stage: step, issue, cancellation, usage }),
  z.strictObject({ ...envelope, kind: z.literal('completed'), note: z.unknown(), usage }),
  // Recorded while no step was in flight: no Machine step was active or will follow.
  z.strictObject({ ...cancellationEnvelope, kind: z.literal('cancelled'), stage: step }),
  // Recorded while a step was in flight or unknown: its native effect and cost stay unknown.
  z.strictObject({ ...cancellationEnvelope, kind: z.literal('cancel-requested'), step }),
  z.strictObject({ ...cancellationEnvelope, kind: z.literal('abandoned'), step }),
]);
export type MissionRecord = z.infer<typeof recordSchema>;
export type Started = Extract<MissionRecord, { kind: 'started' }>;
export type Body = MissionRecord extends infer R
  ? R extends MissionRecord ? Omit<R, 'format' | 'revision'> : never : never;
export type Step = z.infer<typeof step>;

export type MissionConfig = z.infer<typeof configSchema>;
