import { describe, expect, it } from 'vitest';
import { parseOutcomes } from './parse.js';
import { analyzeOutcomes, outcomeKey, stoppedSessions } from './analyze.js';

describe('parseOutcomes', () => {
  it('parses PostToolUse and Stop events, defaulting an unknown status', () => {
    const jsonl = [
      '{"ts":"2026-07-01T00:00:00Z","event":"PostToolUse","kind":"skill","name":"harness:tdd","status":"ok","sessionId":"s1"}',
      '{"ts":"2026-07-01T00:01:00Z","event":"PostToolUse","kind":"tool","name":"Bash","sessionId":"s1"}',
      '{"ts":"2026-07-01T00:02:00Z","event":"Stop","sessionId":"s1"}',
    ].join('\n');
    const evs = parseOutcomes(jsonl);
    expect(evs).toEqual([
      {
        event: 'PostToolUse',
        ts: '2026-07-01T00:00:00Z',
        kind: 'skill',
        name: 'harness:tdd',
        status: 'ok',
        sessionId: 's1',
      },
      {
        event: 'PostToolUse',
        ts: '2026-07-01T00:01:00Z',
        kind: 'tool',
        name: 'Bash',
        status: 'unknown',
        sessionId: 's1',
      },
      { event: 'Stop', ts: '2026-07-01T00:02:00Z', sessionId: 's1' },
    ]);
  });

  it('skips malformed lines, unknown events, and PostToolUse without a name/kind', () => {
    const jsonl = [
      'not json',
      '{"event":"PostToolUse","kind":"skill","name":', // truncated
      '{"event":"Nope","sessionId":"s1"}',
      '{"event":"PostToolUse","kind":"skill","name":"","status":"ok"}', // empty name
      '{"event":"PostToolUse","kind":"bogus","name":"x","status":"ok"}', // bad kind
    ].join('\n');
    expect(parseOutcomes(jsonl)).toEqual([]);
  });

  it('adapts canonical completion and stop events', () => {
    const base = {
      schemaVersion: 1,
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      source: 'runtime:claude',
      correlationId: 'mis_0123456789abcdef0123456789abcdef',
      ts: '2026-07-24T12:00:00.000Z',
      payload: {},
    };
    const jsonl = [
      JSON.stringify({
        ...base,
        seq: 1,
        eventId: 'evt_00000000-0000-4000-8000-000000000001',
        kind: 'runtime.tool.completed',
        subject: 'tool:Bash',
        payload: { category: 'tool', tool: 'Bash', status: 'error' },
      }),
      JSON.stringify({
        ...base,
        seq: 2,
        eventId: 'evt_00000000-0000-4000-8000-000000000002',
        kind: 'runtime.session.stopped',
        subject: 'runtime:claude',
      }),
    ].join('\n');

    expect(parseOutcomes(jsonl)).toEqual([
      {
        event: 'PostToolUse',
        ts: base.ts,
        kind: 'tool',
        name: 'Bash',
        status: 'error',
        sessionId: base.missionId,
      },
      {
        event: 'Stop',
        ts: base.ts,
        sessionId: base.missionId,
      },
    ]);
  });
});

describe('analyzeOutcomes', () => {
  it('tallies completions and computes yield = ok/(ok+error) per component', () => {
    const evs = parseOutcomes(
      [
        '{"event":"PostToolUse","kind":"tool","name":"Bash","status":"ok","ts":"t","sessionId":"s"}',
        '{"event":"PostToolUse","kind":"tool","name":"Bash","status":"error","ts":"t","sessionId":"s"}',
        '{"event":"PostToolUse","kind":"tool","name":"Bash","status":"ok","ts":"t","sessionId":"s"}',
        '{"event":"PostToolUse","kind":"tool","name":"Bash","status":"unknown","ts":"t","sessionId":"s"}',
      ].join('\n'),
    );
    const stats = analyzeOutcomes(evs).get(outcomeKey('tool', 'Bash'));
    expect(stats).toEqual({ completions: 4, ok: 2, error: 1, yield: 2 / 3 });
  });

  it('leaves yield undefined when no ok/error completion is known', () => {
    const evs = parseOutcomes(
      '{"event":"PostToolUse","kind":"tool","name":"Read","status":"unknown","ts":"t","sessionId":"s"}',
    );
    const stats = analyzeOutcomes(evs).get(outcomeKey('tool', 'Read'));
    expect(stats).toEqual({ completions: 1, ok: 0, error: 0 });
    expect(stats?.yield).toBeUndefined();
  });

  it('keys on the bare name so harness:tdd and tdd collapse to one component', () => {
    const evs = parseOutcomes(
      [
        '{"event":"PostToolUse","kind":"skill","name":"harness:tdd","status":"ok","ts":"t","sessionId":"s"}',
        '{"event":"PostToolUse","kind":"skill","name":"tdd","status":"error","ts":"t","sessionId":"s"}',
      ].join('\n'),
    );
    const map = analyzeOutcomes(evs);
    expect(map.size).toBe(1);
    expect(map.get(outcomeKey('skill', 'tdd'))).toMatchObject({ completions: 2, ok: 1, error: 1 });
  });
});

describe('stoppedSessions', () => {
  it('returns the session ids that emitted a Stop', () => {
    const evs = parseOutcomes(
      [
        '{"event":"PostToolUse","kind":"tool","name":"Bash","status":"ok","ts":"t","sessionId":"s1"}',
        '{"event":"Stop","ts":"t","sessionId":"s1"}',
        '{"event":"PostToolUse","kind":"tool","name":"Bash","status":"ok","ts":"t","sessionId":"s2"}',
      ].join('\n'),
    );
    const stopped = stoppedSessions(evs);
    expect(stopped.has('s1')).toBe(true);
    expect(stopped.has('s2')).toBe(false); // interrupted session, no Stop — not a failure
  });
});
