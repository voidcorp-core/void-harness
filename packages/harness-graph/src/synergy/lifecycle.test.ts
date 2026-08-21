import { describe, expect, it } from 'vitest';
import { parseSpecialistLifecycle } from './lifecycle.js';

const HASH = `sha256:${'a'.repeat(64)}`;

function line(
  kind: string,
  subject = 'core:security-engineer',
  source?: string,
  seq = 1,
): string {
  const requested = kind === 'specialist.requested';
  const closure = kind === 'mission.closed';
  return JSON.stringify({
    schemaVersion: 1,
    seq,
    eventId: `evt_0123456789abcde${seq}`,
    missionId: 'mis_human_0123456789abcdef',
    ts: '2026-08-21T12:00:00.000Z',
    source: source ?? (requested || closure
      ? 'void-harness:mission.dispatch'
      : 'runtime:codex'),
    kind,
    subject,
    correlationId: 'mis_human_0123456789abcdef',
    payload: closure
      ? { reason: 'controller-stop' }
      : {
          ...(requested ? { runtime: 'codex' } : { contextId: 'ctx_security_0001' }),
          contractVersion: 2,
          stage: 'post-implementation',
          reviewRound: 1,
          inputHash: HASH,
        },
  });
}

describe('parseSpecialistLifecycle', () => {
  it('extracts only canonical specialist lifecycle events with installed-style names', () => {
    expect(parseSpecialistLifecycle([
      line('specialist.requested'),
      line('specialist.started'),
      line('specialist.completed'),
      line('specialist.failed'),
      line('runtime.tool.started'),
      line('specialist.started', 'core:Unknown Role'),
      '{broken',
    ].join('\n'))).toEqual([
      expect.objectContaining({ specialistId: 'core:security-engineer', name: 'security-engineer', runtime: 'codex', status: 'requested' }),
      expect.objectContaining({ specialistId: 'core:security-engineer', name: 'security-engineer', contextId: 'ctx_security_0001', status: 'started' }),
      expect.objectContaining({ specialistId: 'core:security-engineer', name: 'security-engineer', contextId: 'ctx_security_0001', status: 'completed' }),
      expect.objectContaining({ specialistId: 'core:security-engineer', name: 'security-engineer', contextId: 'ctx_security_0001', status: 'failed' }),
    ]);
  });

  it('marks specialist work closed only from the same canonical mission stream', () => {
    const parsed = parseSpecialistLifecycle([
      line('specialist.requested'),
      line('mission.closed', 'mission'),
    ].join('\n'));

    expect(parsed).toEqual([
      expect.objectContaining({
        specialistId: 'core:security-engineer',
        status: 'requested',
        missionClosed: true,
      }),
    ]);

    expect(parseSpecialistLifecycle([
      line('specialist.requested'),
      line('mission.closed', 'mission', 'runtime:codex'),
    ].join('\n'))).toEqual([
      expect.objectContaining({ missionClosed: false }),
    ]);
  });

  it('ignores lifecycle events sequenced after the first canonical closure', () => {
    expect(parseSpecialistLifecycle([
      line('specialist.requested', 'core:security-engineer', undefined, 1),
      line('mission.closed', 'mission', undefined, 2),
      line('specialist.started', 'core:security-engineer', undefined, 3),
    ].join('\n'))).toEqual([
      expect.objectContaining({ status: 'requested', missionClosed: true }),
    ]);
  });
});
