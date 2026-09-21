// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import type { MissionJournal } from '../runtime/journal.js';
import {
  CANCELLATION_FORMAT, CANCELLATION_KINDS, FORMAT, recordSchema,
  type Body, type MissionRecord,
} from '../verticals/sourced-note/mission-record.js';

/** What cancel and abandon need: the records only, never a runtime. */
export interface MissionStore {
  readonly journal: MissionJournal;
  readonly missionId: string;
}
export type BlockedReason = 'missing' | 'conflict' | 'storage' | 'unrecordable' | 'unreadable'
  | 'incompatible' | 'context-changed' | 'inadmissible' | 'outcome-unknown' | 'not-abandonable';
export type BlockedReceipt = {
  readonly kind: 'blocked'; readonly missionId: string;
  readonly reason: BlockedReason; readonly diagnostic: string;
};
export type Written =
  | { readonly kind: 'written'; readonly records: readonly MissionRecord[] }
  | BlockedReceipt;

export function blocked(
  missionId: string, reason: BlockedReason, diagnostic: string,
): BlockedReceipt {
  return { kind: 'blocked', missionId, reason, diagnostic };
}

// Same receipt at first observation and on every resume: the step's fate is not known.
export function unknownOutcome(missionId: string): BlockedReceipt {
  return blocked(missionId, 'outcome-unknown',
    'A dispatched step has no accepted outcome; its result and cost are unknown '
    + 'and it is not launched again');
}

function parseRecords(raw: readonly unknown[], missionId: string): Written {
  const records: MissionRecord[] = [];
  for (const [index, value] of raw.entries()) {
    const parsed = recordSchema.safeParse(value);
    const format = typeof value === 'object' && value !== null && 'format' in value
      ? value.format : undefined;
    const where = `revision ${String(index + 1)}`;
    if (typeof format === 'string' && format !== FORMAT && format !== CANCELLATION_FORMAT) {
      return blocked(missionId, 'incompatible', `${where}: unsupported record format`);
    }
    if (!parsed.success || parsed.data.revision !== index + 1) {
      return blocked(missionId, 'unreadable',
        `${where}: record does not match its declared format`);
    }
    records.push(parsed.data);
  }
  return { kind: 'written', records };
}

export async function write(
  context: MissionStore, records: readonly MissionRecord[], body: Body,
): Promise<Written> {
  const format = CANCELLATION_KINDS.has(body.kind) ? CANCELLATION_FORMAT : FORMAT;
  const candidate = { format, revision: records.length + 1, ...body };
  const revision = String(candidate.revision);
  // A record the reader would refuse is never written: it would block the mission for good.
  const record = recordSchema.safeParse(candidate);
  if (!record.success) {
    return blocked(context.missionId, 'unrecordable',
      `Revision ${revision} does not match ${format}; nothing was written`);
  }
  const result = await context.journal.append(context.missionId, records.length, candidate);
  if (result.kind === 'appended') return { kind: 'written', records: [...records, record.data] };
  if (result.kind === 'conflict') {
    return blocked(context.missionId, 'conflict',
      `Another writer recorded revision ${revision} first; `
      + 'no further step will be launched by this process');
  }
  if (result.kind === 'unconfirmed') {
    return blocked(context.missionId, 'storage',
      `Revision ${revision} was linked but its durability is unconfirmed `
      + `(${result.reason}); no further step will be launched by this process`);
  }
  return blocked(context.missionId, 'storage',
    `Revision ${revision} was not recorded (${result.reason}); `
    + 'no further step will be launched by this process');
}

export async function recorded(context: MissionStore): Promise<Written> {
  const read = await context.journal.read(context.missionId);
  if (read.kind === 'missing') {
    return blocked(context.missionId, 'missing',
      'No mission is recorded under this identifier');
  }
  if (read.kind === 'unreadable') return blocked(context.missionId, 'unreadable', read.reason);
  return parseRecords(read.records, context.missionId);
}
