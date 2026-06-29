import { describe, expect, it } from 'vitest';
import { parseActivationLine, splitNewLines } from './graph-live.js';

const validLine = JSON.stringify({
  ts: '2026-06-29T10:00:00Z',
  kind: 'tool',
  name: 'Edit',
  event: 'PreToolUse',
  trigger: { tool: 'Edit', fileGlobs: ['src/a.ts'], ext: ['ts'] },
  sessionId: 's1',
});

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
    expect(parseActivationLine(JSON.stringify({ kind: 'hook', name: 'x', trigger: {} }))).toBeNull();
  });

  it('rejects a missing or non-string name', () => {
    expect(parseActivationLine(JSON.stringify({ kind: 'tool', trigger: {} }))).toBeNull();
    expect(parseActivationLine(JSON.stringify({ kind: 'tool', name: 42, trigger: {} }))).toBeNull();
  });

  it('rejects a missing trigger object', () => {
    expect(parseActivationLine(JSON.stringify({ kind: 'tool', name: 'Edit' }))).toBeNull();
  });

  it('rejects empty, whitespace, malformed JSON, and non-object JSON', () => {
    expect(parseActivationLine('')).toBeNull();
    expect(parseActivationLine('   ')).toBeNull();
    expect(parseActivationLine('{not json')).toBeNull();
    expect(parseActivationLine('[1,2,3]')).toBeNull();
    expect(parseActivationLine('42')).toBeNull();
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
