import { describe, expect, it } from 'vitest';
import { parseActivations } from './parse.js';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

describe('parseActivations', () => {
  it('parses valid JSONL lines into typed events, skipping blanks', () => {
    const text = [
      line({ ts: 't1', kind: 'skill', name: 'tdd', trigger: { tool: 'Skill', fileGlobs: [], ext: [] }, sessionId: 's1' }),
      '',
      line({ ts: 't2', kind: 'tool', name: 'Edit', trigger: { tool: 'Edit', fileGlobs: ['a.ts'], ext: ['ts'] }, sessionId: 's1' }),
    ].join('\n');
    const events = parseActivations(text);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'skill', name: 'tdd', sessionId: 's1' });
    expect(events[1]?.trigger).toEqual({ tool: 'Edit', fileGlobs: ['a.ts'], ext: ['ts'] });
  });

  it('drops malformed JSON, unknown kinds, and missing names tolerantly', () => {
    const text = [
      '{not json',
      line({ kind: 'hook', name: 'x', trigger: {} }),
      line({ kind: 'skill', trigger: {} }),
      line({ kind: 'agent', name: 'code-explorer', trigger: { tool: 'Task' }, sessionId: 's' }),
    ].join('\n');
    const events = parseActivations(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'agent', name: 'code-explorer' });
  });

  it('defaults a missing trigger/sub-fields rather than dropping the event', () => {
    const events = parseActivations(line({ kind: 'tool', name: 'Bash', trigger: { tool: 'Bash' } }));
    expect(events[0]?.trigger).toEqual({ tool: 'Bash', fileGlobs: [], ext: [] });
  });

  it('returns empty for empty input', () => {
    expect(parseActivations('')).toEqual([]);
  });
});
