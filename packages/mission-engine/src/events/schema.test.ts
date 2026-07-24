import { describe, expect, it } from 'vitest';
import {
  MAX_EVENT_LINE_BYTES,
  parseEvent,
  parseEventLine,
  serializeEvent,
} from './schema.js';
import { event } from '../test/events.js';

describe('canonical event schema', () => {
  it('round-trips one bounded canonical event', () => {
    const encoded = serializeEvent(event());
    const parsed = parseEventLine(encoded);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(event());
  });

  it('rejects identities and sequence values outside the contract', () => {
    expect(parseEvent({ ...event(), seq: 0 }).ok).toBe(false);
    expect(parseEvent({ ...event(), eventId: 'shared-counter' }).ok).toBe(false);
    expect(parseEvent({ ...event(), missionId: '../escape' }).ok).toBe(false);
  });

  it('rejects an event line before parsing when it exceeds the byte budget', () => {
    const oversized = 'x'.repeat(MAX_EVENT_LINE_BYTES + 1);
    const parsed = parseEventLine(oversized);

    expect(parsed).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: 'event-line-too-large' }),
    });
  });

  it('rejects payloads that are too deep or contain non-JSON values', () => {
    let deep: unknown = 'leaf';
    for (let index = 0; index < 12; index += 1) deep = { nested: deep };

    expect(parseEvent({ ...event(), payload: deep }).ok).toBe(false);
    expect(parseEvent({ ...event(), payload: { secret: undefined } }).ok).toBe(false);
  });

  it('isolates malformed JSON with a structured issue', () => {
    expect(parseEventLine('{"partial"')).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: 'invalid-event-json' }),
    });
  });
});
