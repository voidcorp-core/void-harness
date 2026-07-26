import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from './types.js';
import { validateDecisions } from './validate.js';

function decision(
  id: string,
  overrides: Partial<DecisionRecord> = {},
): DecisionRecord {
  return {
    schemaVersion: 1,
    id,
    createdAt: '2026-07-24T10:15:00.000Z',
    title: id,
    status: 'accepted',
    deciders: ['folpe'],
    supersedes: [],
    body: '# Decision',
    file: `${id}.md`,
    legacy: false,
    ...overrides,
  };
}

describe('validateDecisions', () => {
  it('reports duplicate identities', () => {
    const issues = validateDecisions([
      decision('adr:same', { file: 'a.md' }),
      decision('adr:same', { file: 'b.md' }),
    ]);

    expect(issues).toContainEqual({
      code: 'duplicate-id',
      file: 'b.md',
      message: "decision id 'adr:same' is already declared by a.md",
    });
  });

  it('reports a superseded identity that does not exist', () => {
    const issues = validateDecisions([
      decision('adr:new', { supersedes: ['adr:missing'] }),
    ]);

    expect(issues).toContainEqual({
      code: 'missing-superseded-decision',
      file: 'adr:new.md',
      message: "supersedes unknown decision 'adr:missing'",
    });
  });

  it('reports every member of a supersession cycle', () => {
    const issues = validateDecisions([
      decision('adr:a', { supersedes: ['adr:b'] }),
      decision('adr:b', { supersedes: ['adr:c'] }),
      decision('adr:c', { supersedes: ['adr:a'] }),
    ]);

    expect(issues.filter((issue) => issue.code === 'supersession-cycle')).toHaveLength(3);
    expect(issues.map((issue) => issue.file).sort()).toEqual([
      'adr:a.md',
      'adr:b.md',
      'adr:c.md',
    ]);
  });

  it('accepts an acyclic mix of legacy and v3 records', () => {
    const legacy = decision('legacy:old', {
      schemaVersion: undefined,
      createdAt: '2026-06-01',
      legacy: true,
      deciders: [],
    });
    const current = decision('adr:new', { supersedes: ['legacy:old'] });

    expect(validateDecisions([legacy, current])).toEqual([]);
  });
});
