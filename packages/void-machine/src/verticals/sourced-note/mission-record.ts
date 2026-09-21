// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import { z } from 'zod';
import { noteInputSchema } from './note.js';

// Historical kinds keep the first format, so a mission never cancelled keeps its bytes and
// an older binary still reads it. Each later kind exists only in the format that introduced
// it, which an older binary refuses as incompatible instead of misreading.
export const FORMAT = 'void-machine.note-mission/1';
export const CANCELLATION_FORMAT = 'void-machine.note-mission/2';
export const REJECTION_FORMAT = 'void-machine.note-mission/3';
export const FORMATS: ReadonlySet<string> = new Set([
  FORMAT, CANCELLATION_FORMAT, REJECTION_FORMAT,
]);
const LATER_FORMATS: ReadonlyMap<string, string> = new Map([
  ['cancelled', CANCELLATION_FORMAT], ['cancel-requested', CANCELLATION_FORMAT],
  ['abandoned', CANCELLATION_FORMAT], ['rejected', REJECTION_FORMAT],
  ['discarded', REJECTION_FORMAT],
]);
export function formatOf(kind: string): string {
  return LATER_FORMATS.get(kind) ?? FORMAT;
}
export const noteSteps = ['extraction', 'synthesis'] as const;
const step = z.enum(noteSteps);
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
const rejectionEnvelope = { format: z.literal(REJECTION_FORMAT), revision: revisionField };
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
  // The vertical refused the step's outcome; the usage observed for it is kept.
  z.strictObject({ ...rejectionEnvelope, kind: z.literal('rejected'), step, usage }),
  // A result returned after cancellation was requested: its value is not recorded.
  z.strictObject({ ...rejectionEnvelope, kind: z.literal('discarded'), step, usage }),
]);
export type MissionRecord = z.infer<typeof recordSchema>;
export type Started = Extract<MissionRecord, { kind: 'started' }>;
export type Body = MissionRecord extends infer R
  ? R extends MissionRecord ? Omit<R, 'format' | 'revision'> : never : never;
export type Step = z.infer<typeof step>;

export type MissionConfig = z.infer<typeof configSchema>;
export type MissionIssue = z.infer<typeof issue>;
export type MissionUsage = Readonly<Record<string, unknown>>;
