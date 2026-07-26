import { describe, expect, it } from 'vitest';
import { event } from '../test/events.js';
import {
  initialEventStream,
  reduceEventStream,
  replayEventLog,
} from './reducer.js';

describe('event stream reducer', () => {
  it('reduces a continuous stream and ignores duplicate event IDs idempotently', () => {
    const first = event();
    const second = event({
      seq: 2,
      eventId: 'evt_00000000-0000-4000-8000-000000000002',
    });
    const once = reduceEventStream(initialEventStream(), first);
    const twice = reduceEventStream(reduceEventStream(once, first), second);

    expect(twice.events).toEqual([first, second]);
    expect(twice.lastSeq).toBe(2);
    expect(twice.continuity).toBe('complete');
    expect(twice.duplicateEventIds).toBe(1);
  });

  it('marks a missing sequence as partial instead of presenting it as live truth', () => {
    const state = reduceEventStream(
      initialEventStream(),
      event({ seq: 3 }),
    );

    expect(state.continuity).toBe('partial');
    expect(state.issues).toEqual([
      expect.objectContaining({
        code: 'sequence-gap',
        expectedSeq: 1,
        actualSeq: 3,
      }),
    ]);
  });

  it('isolates invalid and partial lines during replay', () => {
    const first = JSON.stringify(event());
    const second = JSON.stringify(event({
      seq: 2,
      eventId: 'evt_00000000-0000-4000-8000-000000000002',
    }));
    const replayed = replayEventLog(`${first}\n{"partial"\n${second}\n`);

    expect(replayed.events).toHaveLength(2);
    expect(replayed.invalidLines).toBe(1);
    expect(replayed.continuity).toBe('partial');
    expect(replayed.issues).toEqual([
      expect.objectContaining({ code: 'invalid-event-line', line: 2 }),
    ]);
  });
});
