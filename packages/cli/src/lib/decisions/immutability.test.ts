import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from './types.js';
import {
  immutableDecisionIssues,
  isSafeGitRef,
  parseGitNameStatus,
} from './immutability.js';

function record(
  id: string,
  file: string,
  status: DecisionRecord['status'],
): DecisionRecord {
  return {
    schemaVersion: 1,
    id,
    createdAt: '2026-07-24T10:15:00.000Z',
    title: id,
    status,
    deciders: ['folpe'],
    supersedes: [],
    body: '# decision',
    file,
    legacy: false,
  };
}

describe('parseGitNameStatus', () => {
  it('parses modified, deleted and renamed decision paths', () => {
    expect(
      parseGitNameStatus(
        'M\tdocs/decisions/a.md\nD\tdocs/decisions/b.md\nR100\tdocs/decisions/c.md\tdocs/decisions/d.md\n',
      ),
    ).toEqual([
      { kind: 'modified', before: 'docs/decisions/a.md' },
      { kind: 'deleted', before: 'docs/decisions/b.md' },
      {
        kind: 'renamed',
        before: 'docs/decisions/c.md',
        after: 'docs/decisions/d.md',
      },
    ]);
  });

  it('treats a git type change as a decision modification', () => {
    expect(parseGitNameStatus('T\tdocs/decisions/a.md\n')).toEqual([
      { kind: 'modified', before: 'docs/decisions/a.md' },
    ]);
  });
});

describe('immutableDecisionIssues', () => {
  it('blocks modifying, deleting or renaming a decision accepted at the base', () => {
    const base = new Map([
      ['docs/decisions/a.md', record('adr:a', 'docs/decisions/a.md', 'accepted')],
      ['docs/decisions/b.md', record('adr:b', 'docs/decisions/b.md', 'accepted')],
      ['docs/decisions/c.md', record('adr:c', 'docs/decisions/c.md', 'accepted')],
    ]);

    const issues = immutableDecisionIssues(
      [
        { kind: 'modified', before: 'docs/decisions/a.md' },
        { kind: 'deleted', before: 'docs/decisions/b.md' },
        {
          kind: 'renamed',
          before: 'docs/decisions/c.md',
          after: 'docs/decisions/d.md',
        },
      ],
      base,
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      'accepted-decision-modified',
      'accepted-decision-deleted',
      'accepted-decision-renamed',
    ]);
  });

  it('allows editing a proposed decision', () => {
    const base = new Map([
      ['docs/decisions/a.md', record('adr:a', 'docs/decisions/a.md', 'proposed')],
    ]);

    expect(
      immutableDecisionIssues(
        [{ kind: 'modified', before: 'docs/decisions/a.md' }],
        base,
      ),
    ).toEqual([]);
  });

  it('fails closed when an existing changed record cannot be parsed at the base', () => {
    expect(
      immutableDecisionIssues(
        [{ kind: 'modified', before: 'docs/decisions/a.md' }],
        new Map(),
      ),
    ).toEqual([
      {
        code: 'git-check-failed',
        file: 'docs/decisions/a.md',
        message: 'could not prove the base decision status; immutability check fails closed',
      },
    ]);
  });
});

describe('isSafeGitRef', () => {
  it('accepts ordinary refs and rejects revision/path expressions', () => {
    expect(isSafeGitRef('origin/main')).toBe(true);
    expect(isSafeGitRef('feature/adr-v3')).toBe(true);
    expect(isSafeGitRef('main:docs/decisions/a.md')).toBe(false);
    expect(isSafeGitRef('--output=/tmp/result')).toBe(false);
  });
});
