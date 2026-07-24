import type { CanonicalEvent } from '../events/types.js';

export function event(
  overrides: Partial<CanonicalEvent> = {},
): CanonicalEvent {
  return {
    schemaVersion: 1,
    seq: 1,
    eventId: 'evt_00000000-0000-4000-8000-000000000001',
    missionId: 'mis_0123456789abcdef0123456789abcdef',
    ts: '2026-07-24T12:00:00.000Z',
    source: 'runtime:codex',
    kind: 'runtime.tool.started',
    subject: 'skill:harness:tdd',
    correlationId: 'mis_0123456789abcdef0123456789abcdef',
    payload: { category: 'skill', tool: 'Skill' },
    ...overrides,
  };
}
