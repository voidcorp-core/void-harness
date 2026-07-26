import { describe, expect, it } from 'vitest';
import {
  assertCanonicalHookReplay,
  runtimesForMode,
} from './conformance-hooks-lib.mjs';

function event(
  seq: number,
  runtime: 'claude' | 'codex',
  kind: 'runtime.tool.started' | 'hook.completed',
): string {
  return JSON.stringify({
    schemaVersion: 1,
    seq,
    eventId: `evt_${runtime}_${seq}`,
    missionId: 'mis_conformance_both',
    ts: '2026-07-24T00:00:00.000Z',
    source: `runtime:${runtime}`,
    kind,
    subject: kind === 'hook.completed' ? 'hook:no-console' : 'tool:Write',
    correlationId: 'mis_conformance_both',
    payload: {},
  });
}

describe('hook conformance replay', () => {
  it('maps install modes to the runtimes that must actually fire', () => {
    expect(runtimesForMode('claude')).toEqual(['claude']);
    expect(runtimesForMode('codex')).toEqual(['codex']);
    expect(runtimesForMode('both')).toEqual(['claude', 'codex']);
  });

  it('accepts a contiguous canonical stream with runtime and hook proof', () => {
    const body = [
      event(1, 'claude', 'runtime.tool.started'),
      event(2, 'codex', 'runtime.tool.started'),
      event(3, 'claude', 'hook.completed'),
      event(4, 'codex', 'hook.completed'),
      '',
    ].join('\n');

    expect(() =>
      assertCanonicalHookReplay(body, {
        missionId: 'mis_conformance_both',
        runtimes: ['claude', 'codex'],
      }),
    ).not.toThrow();
  });

  it.each([
    {
      name: 'malformed JSON',
      body: '{bad json}\n',
      issue: 'invalid JSON',
      runtimes: ['claude', 'codex'] as const,
    },
    {
      name: 'a sequence gap',
      body: [
        event(1, 'claude', 'runtime.tool.started'),
        event(3, 'claude', 'hook.completed'),
      ].join('\n'),
      issue: 'expected seq 2',
      runtimes: ['claude'] as const,
    },
    {
      name: 'a missing runtime proof',
      body: [
        event(1, 'claude', 'runtime.tool.started'),
        event(2, 'claude', 'hook.completed'),
      ].join('\n'),
      issue: 'runtime:codex',
      runtimes: ['claude', 'codex'] as const,
    },
    {
      name: 'a missing enforcement proof',
      body: event(1, 'claude', 'runtime.tool.started'),
      issue: 'hook.completed',
      runtimes: ['claude'] as const,
    },
  ])('rejects $name', ({ body, issue, runtimes }) => {
    expect(() =>
      assertCanonicalHookReplay(body, {
        missionId: 'mis_conformance_both',
        runtimes,
      }),
    ).toThrow(issue);
  });
});
