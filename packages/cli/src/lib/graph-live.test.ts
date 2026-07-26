import { describe, expect, it } from 'vitest';
import {
  buildLiveSnapshot,
  parseActivationLine,
  splitNewLines,
} from './graph-live.js';

const validLine = JSON.stringify({
  ts: '2026-06-29T10:00:00Z',
  kind: 'tool',
  name: 'Edit',
  event: 'PreToolUse',
  trigger: { tool: 'Edit', fileGlobs: ['src/a.ts'], ext: ['ts'] },
  sessionId: 's1',
});

function canonical(seq: number, eventId: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    seq,
    eventId,
    missionId: 'mis_0123456789abcdef',
    ts: `2026-07-24T12:00:0${seq}.000Z`,
    source: 'runtime:codex',
    kind: 'runtime.tool.started',
    subject: 'skill:harness:tdd',
    correlationId: 'mis_0123456789abcdef',
    payload: {
      category: 'skill',
      tool: 'Skill',
      fileGlobs: ['src/a.ts'],
      extensions: ['ts'],
    },
  });
}

describe('parseActivationLine', () => {
  it('parses a well-formed activation line into a typed event', () => {
    expect(parseActivationLine(validLine)).toEqual({
      ts: '2026-06-29T10:00:00Z',
      kind: 'tool',
      name: 'Edit',
      event: 'PreToolUse',
      trigger: { tool: 'Edit', fileGlobs: ['src/a.ts'], ext: ['ts'] },
      sessionId: 's1',
    });
  });

  it('defaults the optional fields when absent but kind/name/trigger are valid', () => {
    const line = JSON.stringify({ kind: 'skill', name: 'tdd', trigger: { tool: 'Skill' } });
    expect(parseActivationLine(line)).toEqual({
      ts: '',
      kind: 'skill',
      name: 'tdd',
      event: '',
      trigger: { tool: 'Skill', fileGlobs: [], ext: [] },
      sessionId: '',
    });
  });

  it('rejects an unknown kind', () => {
    expect(parseActivationLine(JSON.stringify({ kind: 'hook', name: 'x', trigger: {} }))).toBeUndefined();
  });

  it('rejects a missing or non-string name', () => {
    expect(parseActivationLine(JSON.stringify({ kind: 'tool', trigger: {} }))).toBeUndefined();
    expect(parseActivationLine(JSON.stringify({ kind: 'tool', name: 42, trigger: {} }))).toBeUndefined();
  });

  it('rejects a missing trigger object', () => {
    expect(parseActivationLine(JSON.stringify({ kind: 'tool', name: 'Edit' }))).toBeUndefined();
  });

  it('rejects empty, whitespace, malformed JSON, and non-object JSON', () => {
    expect(parseActivationLine('')).toBeUndefined();
    expect(parseActivationLine('   ')).toBeUndefined();
    expect(parseActivationLine('{not json')).toBeUndefined();
    expect(parseActivationLine('[1,2,3]')).toBeUndefined();
    expect(parseActivationLine('42')).toBeUndefined();
  });

  it('adapts one canonical runtime activation', () => {
    expect(parseActivationLine(canonical(1, 'evt_00000001'))).toMatchObject({
      kind: 'skill',
      name: 'harness:tdd',
      sessionId: 'mis_0123456789abcdef',
    });
  });
});

describe('buildLiveSnapshot', () => {
  it('keeps stable event IDs and marks a contiguous mission complete', () => {
    const snapshot = buildLiveSnapshot([
      canonical(1, 'evt_00000001'),
      canonical(2, 'evt_00000002'),
    ].join('\n'));
    expect(snapshot.continuity).toBe('complete');
    expect(snapshot.events.map((event) => event.id)).toEqual([
      'evt_00000001',
      'evt_00000002',
    ]);
  });

  it('marks a sequence gap and a partial canonical append as partial', () => {
    const gap = buildLiveSnapshot([
      canonical(1, 'evt_00000001'),
      canonical(3, 'evt_00000003'),
    ].join('\n'));
    expect(gap.continuity).toBe('partial');

    const partial = buildLiveSnapshot(
      `${canonical(1, 'evt_00000001')}\n{"schemaVersion":1,"seq":2`,
    );
    expect(partial.continuity).toBe('partial');
    expect(partial.events).toHaveLength(1);
  });

  it('retains only the bounded tail and reports truncation', () => {
    const snapshot = buildLiveSnapshot([
      canonical(1, 'evt_00000001'),
      canonical(2, 'evt_00000002'),
    ].join('\n'), 1);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.events.map((event) => event.id)).toEqual(['evt_00000002']);
  });
});

describe('splitNewLines', () => {
  it('returns complete lines and keeps the trailing partial as rest', () => {
    expect(splitNewLines('a\nb\npar')).toEqual({ lines: ['a', 'b'], rest: 'par' });
  });

  it('returns empty rest when the buffer ends on a newline', () => {
    expect(splitNewLines('a\nb\n')).toEqual({ lines: ['a', 'b'], rest: '' });
  });

  it('treats a buffer with no newline as all-rest', () => {
    expect(splitNewLines('nonewline')).toEqual({ lines: [], rest: 'nonewline' });
  });

  it('handles the empty buffer', () => {
    expect(splitNewLines('')).toEqual({ lines: [], rest: '' });
  });
});
