import { describe, expect, it } from 'vitest';
import { parseEvalArgs } from './cli-args.js';

describe('eval CLI arguments', () => {
  it('keeps the existing single-skill Claude invocation', () => {
    expect(parseEvalArgs(['tdd', '--runs', '2'])).toMatchObject({
      caseKey: 'tdd',
      suite: undefined,
      runtimes: ['claude'],
      runs: 2,
    });
  });

  it('selects the mission-team suite on both runtimes', () => {
    expect(parseEvalArgs([
      '--suite',
      'mission-team',
      '--runtime',
      'claude,codex',
      '--runs',
      '1',
    ])).toMatchObject({
      caseKey: 'mission-team',
      suite: 'mission-team',
      runtimes: ['claude', 'codex'],
      runs: 1,
    });
  });

  it('rejects unknown runtimes and conflicting selectors', () => {
    expect(() => parseEvalArgs(['tdd', '--runtime', 'hermes'])).toThrow(
      'runtime must be claude, codex, or both',
    );
    expect(() => parseEvalArgs(['tdd', '--suite', 'mission-team'])).toThrow(
      'choose a skill or --suite, not both',
    );
  });
});
