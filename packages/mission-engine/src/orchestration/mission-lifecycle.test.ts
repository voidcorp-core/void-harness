import { describe, expect, it } from 'vitest';
import { event } from '../test/events.js';
import type { CanonicalEvent, JsonValue } from '../events/types.js';
import { projectMissionLifecycle } from './mission-lifecycle.js';

function entry(seq: number, kind: string, payload: JsonValue = {}): CanonicalEvent {
  return event({ seq, eventId: `evt_${seq}`, kind, subject: 'mission', payload });
}
const started = entry(1, 'mission.started');
const closed = entry(2, 'mission.closed', { reason: 'controller-stop' });
const recovered = entry(3, 'mission.recovered', {
  schemaVersion: 1, closureEventId: closed.eventId, previousEpisodeId: started.eventId,
  priorJournalHash: `sha256:${'a'.repeat(64)}`, priorJournalLastSeq: 2,
});

describe('mission lifecycle episodes', () => {
  it('projects the legacy controller closure without losing its identity', () => {
    expect(projectMissionLifecycle([started, closed])).toMatchObject({
      status: 'closed', episodeId: started.eventId, closure: closed,
    });
  });
  it('reopens only by an appended receipt and uses its event ID as the next episode', () => {
    const history = Object.freeze([started, closed, recovered]);
    expect(projectMissionLifecycle(history)).toEqual({ status: 'open', episodeId: recovered.eventId });
    expect(history).toEqual([started, closed, recovered]);
  });
  it('closes the recovered episode explicitly', () => {
    expect(projectMissionLifecycle([started, closed, recovered,
      entry(4, 'mission.closed', { reason: 'completed', episodeId: recovered.eventId }),
    ])).toMatchObject({ status: 'closed', episodeId: recovered.eventId });
  });
  it.each(['completed', 'abandoned', 'interrupted'])('does not recover a %s closure', (reason) => {
    expect(projectMissionLifecycle([started, entry(2, 'mission.closed', { reason }), recovered]))
      .toMatchObject({ status: 'invalid' });
  });
  it.each([
    [started, recovered],
    [started, closed, entry(3, 'mission.recovered', { schemaVersion: 1, closureEventId: 'other' })],
    [started, closed, recovered, entry(4, 'mission.closed', { reason: 'controller-stop' })],
    [started, closed, recovered, entry(4, 'mission.started')],
    [started, closed, entry(3, 'mission.closed', { reason: 'controller-stop' })],
    [started, entry(3, 'mission.closed', { reason: 'controller-stop' })],
  ])('refuses malformed episode linkage %#', (...events) => {
    const result = projectMissionLifecycle(events);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reasons.length).toBeGreaterThan(0);
  });
});
