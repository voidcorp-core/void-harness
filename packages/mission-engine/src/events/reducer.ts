import { parseEventLine } from './schema.js';
import type { CanonicalEvent } from './types.js';

export type EventContinuity = 'empty' | 'complete' | 'partial';

export type EventStreamIssue =
  | {
      readonly code: 'sequence-gap';
      readonly expectedSeq: number;
      readonly actualSeq: number;
    }
  | {
      readonly code: 'duplicate-sequence';
      readonly seq: number;
    }
  | {
      readonly code: 'out-of-order-sequence';
      readonly previousSeq: number;
      readonly actualSeq: number;
    }
  | {
      readonly code: 'invalid-event-line';
      readonly line: number;
      readonly detail: string;
    };

export interface EventStreamState {
  readonly events: readonly CanonicalEvent[];
  readonly eventIds: ReadonlySet<string>;
  readonly sequences: ReadonlySet<number>;
  readonly lastSeq: number;
  readonly continuity: EventContinuity;
  readonly duplicateEventIds: number;
  readonly invalidLines: number;
  readonly issues: readonly EventStreamIssue[];
}

export function initialEventStream(): EventStreamState {
  return {
    events: [],
    eventIds: new Set(),
    sequences: new Set(),
    lastSeq: 0,
    continuity: 'empty',
    duplicateEventIds: 0,
    invalidLines: 0,
    issues: [],
  };
}

export function reduceEventStream(
  state: EventStreamState,
  event: CanonicalEvent,
): EventStreamState {
  if (state.eventIds.has(event.eventId)) {
    return {
      ...state,
      duplicateEventIds: state.duplicateEventIds + 1,
    };
  }

  const eventIds = new Set(state.eventIds);
  eventIds.add(event.eventId);
  const sequences = new Set(state.sequences);
  const issues = [...state.issues];
  let continuity: EventContinuity =
    state.continuity === 'empty' ? 'complete' : state.continuity;

  if (sequences.has(event.seq)) {
    issues.push({ code: 'duplicate-sequence', seq: event.seq });
    continuity = 'partial';
  } else {
    const expected = state.lastSeq + 1;
    if (event.seq > expected) {
      issues.push({
        code: 'sequence-gap',
        expectedSeq: expected,
        actualSeq: event.seq,
      });
      continuity = 'partial';
    } else if (event.seq < expected) {
      issues.push({
        code: 'out-of-order-sequence',
        previousSeq: state.lastSeq,
        actualSeq: event.seq,
      });
      continuity = 'partial';
    }
    sequences.add(event.seq);
  }

  return {
    events: [...state.events, event],
    eventIds,
    sequences,
    lastSeq: Math.max(state.lastSeq, event.seq),
    continuity,
    duplicateEventIds: state.duplicateEventIds,
    invalidLines: state.invalidLines,
    issues,
  };
}

export function replayEventLog(text: string): EventStreamState {
  const events: CanonicalEvent[] = [];
  const eventIds = new Set<string>();
  const sequences = new Set<number>();
  const issues: EventStreamIssue[] = [];
  let lastSeq = 0;
  let continuity: EventContinuity = 'empty';
  let duplicateEventIds = 0;
  let invalidLines = 0;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') continue;
    const parsed = parseEventLine(line);
    if (parsed.ok) {
      const event = parsed.value;
      if (eventIds.has(event.eventId)) {
        duplicateEventIds += 1;
        continue;
      }
      eventIds.add(event.eventId);
      events.push(event);
      continuity = continuity === 'empty' ? 'complete' : continuity;
      if (sequences.has(event.seq)) {
        issues.push({ code: 'duplicate-sequence', seq: event.seq });
        continuity = 'partial';
      } else {
        const expectedSeq = lastSeq + 1;
        if (event.seq > expectedSeq) {
          issues.push({
            code: 'sequence-gap',
            expectedSeq,
            actualSeq: event.seq,
          });
          continuity = 'partial';
        } else if (event.seq < expectedSeq) {
          issues.push({
            code: 'out-of-order-sequence',
            previousSeq: lastSeq,
            actualSeq: event.seq,
          });
          continuity = 'partial';
        }
        sequences.add(event.seq);
      }
      lastSeq = Math.max(lastSeq, event.seq);
    } else {
      continuity = 'partial';
      invalidLines += 1;
      issues.push({
        code: 'invalid-event-line',
        line: index + 1,
        detail: `${parsed.issue.code}: ${parsed.issue.message}`,
      });
    }
  }
  return {
    events,
    eventIds,
    sequences,
    lastSeq,
    continuity,
    duplicateEventIds,
    invalidLines,
    issues,
  };
}
