import { describe, expect, it } from 'vitest';
import { parseDecisionsArgs } from './decisions.js';

describe('parseDecisionsArgs', () => {
  it('parses the non-interactive new command', () => {
    expect(
      parseDecisionsArgs([
        'new',
        '--title',
        'One file per ADR',
        '--slug',
        'one-file',
        '--status',
        'proposed',
        '--decider',
        'folpe',
      ]),
    ).toEqual({
      kind: 'new',
      title: 'One file per ADR',
      slug: 'one-file',
      status: 'proposed',
      deciders: ['folpe'],
      supersedes: [],
      json: false,
    });
  });

  it('parses check with a git base and JSON output', () => {
    expect(parseDecisionsArgs(['check', '--base', 'origin/main', '--json'])).toEqual({
      kind: 'check',
      base: 'origin/main',
      json: true,
    });
  });

  it('parses a read-only render projection', () => {
    expect(parseDecisionsArgs(['render', '--format', 'json'])).toEqual({
      kind: 'render',
      format: 'json',
    });
  });

  it('returns an actionable error when required args are missing', () => {
    expect(parseDecisionsArgs(['new', '--title', 'Missing slug'])).toEqual({
      kind: 'invalid',
      code: 'DECISIONS_USAGE',
      problem: 'missing required option --slug',
      cause: 'decisions new requires a stable readable filename slug',
      fix: 'void-harness decisions new --title <title> --slug <slug>',
    });
  });

  it('rejects missing option values before creating a malformed record', () => {
    expect(
      parseDecisionsArgs([
        'new',
        '--title',
        '--slug',
        'one-file',
      ]),
    ).toEqual({
      kind: 'invalid',
      code: 'DECISIONS_USAGE',
      problem: 'missing value for --title',
      cause: '--title requires a value',
      fix: 'void-harness decisions new --help',
    });
  });

  it('rejects unknown options instead of silently ignoring a typo', () => {
    expect(parseDecisionsArgs(['check', '--bsae', 'origin/main'])).toEqual({
      kind: 'invalid',
      code: 'DECISIONS_USAGE',
      problem: "unknown option '--bsae'",
      cause: 'decisions check does not support this option',
      fix: 'void-harness decisions check --help',
    });
  });

  it('rejects a blank title before touching the filesystem', () => {
    expect(
      parseDecisionsArgs([
        'new',
        '--title',
        '   ',
        '--slug',
        'blank-title',
      ]),
    ).toEqual({
      kind: 'invalid',
      code: 'DECISIONS_USAGE',
      problem: 'invalid empty title',
      cause: '--title must contain readable text',
      fix: 'provide a decision title of 1 to 200 characters',
    });
  });
});
