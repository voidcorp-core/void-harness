// tdd-cover: e2e packages/void-machine/test/legacy-note-journals.test.ts
import type { MissionDescription, MissionEvent } from '../../core/mission.js';
import {
  admitExtraction, admitNote, type Extraction, type Note, type NoteInput,
} from './note.js';
import {
  FORMATS, formatOf, noteSteps, recordSchema,
  type Body, type MissionConfig, type MissionIssue, type MissionUsage, type Step,
} from './mission-record.js';

/** An admitted note value, tagged so a later step can use it without parsing again. */
export type NoteValue =
  | { readonly kind: 'extraction'; readonly extraction: Extraction }
  | { readonly kind: 'note'; readonly note: Note };
type NoteDescription = MissionDescription<NoteInput, MissionConfig, Step,
  NoteValue, MissionIssue, MissionUsage>;
// Decoded values stay unknown until the kernel admits them against the recorded request.
type RecordedEvent = MissionEvent<NoteInput, MissionConfig, Step,
  unknown, MissionIssue, MissionUsage>;
type NoteEvent = MissionEvent<NoteInput, MissionConfig, Step,
  NoteValue, MissionIssue, MissionUsage>;

type Decode = ReturnType<NoteDescription['codec']['decode']>;

function decode(raw: unknown, revision: number): Decode {
  const format = typeof raw === 'object' && raw !== null && 'format' in raw
    ? raw.format : undefined;
  if (typeof format === 'string' && !FORMATS.has(format)) {
    return { kind: 'incompatible' };
  }
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success || parsed.data.revision !== revision) return { kind: 'unreadable' };
  const record = parsed.data;
  const event: RecordedEvent = (() => {
    switch (record.kind) {
      case 'started': return { kind: 'started', input: record.input,
        config: record.config, contract: record.contract };
      case 'dispatched': return { kind: 'dispatched', step: record.step,
        executionId: record.executionId };
      case 'accepted': return { kind: 'accepted', step: record.step,
        value: record.value, usage: record.usage };
      case 'completed': return { kind: 'completed', value: record.note, usage: record.usage };
      case 'unconfirmed': return { kind: 'unconfirmed', step: record.step,
        issue: record.issue, cancellation: record.cancellation, usage: record.usage };
      case 'stopped': return { kind: 'stopped', step: record.stage,
        issue: record.issue, cancellation: record.cancellation, usage: record.usage };
      case 'cancelled': return { kind: 'cancelled', step: record.stage };
      case 'cancel-requested': return { kind: 'cancel-requested', step: record.step };
      case 'abandoned': return { kind: 'abandoned', step: record.step };
      case 'rejected': return { kind: 'rejected', step: record.step, usage: record.usage };
      default: { const neverRecord: never = record; return neverRecord; }
    }
  })();
  return { kind: 'decoded', event };
}

function bodyOf(event: NoteEvent): Body | undefined {
  switch (event.kind) {
    case 'started': return { kind: 'started', input: event.input,
      config: event.config, contract: event.contract };
    case 'dispatched': return { kind: 'dispatched', step: event.step,
      executionId: event.executionId };
    case 'accepted': return event.step === 'extraction' && event.value.kind === 'extraction'
      ? { kind: 'accepted', step: 'extraction', value: event.value.extraction,
        usage: [...event.usage] }
      : undefined;
    case 'completed': return event.value.kind === 'note'
      ? { kind: 'completed', note: event.value.note, usage: [...event.usage] } : undefined;
    case 'unconfirmed': return { kind: 'unconfirmed', step: event.step,
      issue: event.issue, cancellation: event.cancellation, usage: [...event.usage] };
    case 'stopped': return { kind: 'stopped', stage: event.step,
      issue: event.issue, cancellation: event.cancellation, usage: [...event.usage] };
    case 'cancelled': return { kind: 'cancelled', stage: event.step };
    case 'cancel-requested': return { kind: 'cancel-requested', step: event.step };
    case 'abandoned': return { kind: 'abandoned', step: event.step };
    case 'rejected': return { kind: 'rejected', step: event.step, usage: [...event.usage] };
    default: { const neverEvent: never = event; return neverEvent; }
  }
}

export const noteMissionDescription: NoteDescription = {
  steps: noteSteps,
  codec: {
    decode,
    encode(event, revision) {
      const body = bodyOf(event);
      if (body === undefined) return { kind: 'invalid' };
      const candidate = { format: formatOf(body.kind), revision, ...body };
      return recordSchema.safeParse(candidate).success
        ? { kind: 'encoded', record: candidate } : { kind: 'invalid' };
    },
  },
  admit(step, raw, input) {
    switch (step) {
      case 'extraction': {
        const extraction = admitExtraction(raw, input);
        return extraction.ok
          ? { ok: true, value: { kind: 'extraction', extraction: extraction.value } }
          : { ok: false, reason: 'extraction breaks its schema, size or source quotes' };
      }
      case 'synthesis': {
        const note = admitNote(raw, input);
        return note.ok ? { ok: true, value: { kind: 'note', note: note.value } }
          : { ok: false, reason: 'note breaks its schema, size or source coverage' };
      }
      default: { const neverStep: never = step; return neverStep; }
    }
  },
};
