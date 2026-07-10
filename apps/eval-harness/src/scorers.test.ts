import { describe, expect, it } from 'vitest';
import { commitDisciplineScorer, tddScorer } from './scorers.js';
import type { RunOutcome } from './types.js';

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  ok: true,
  costUsd: 0,
  files: {},
  lastCommit: undefined,
  transcript: '',
  ...over,
});

describe('commitDisciplineScorer (100% deterministic — no LLM judge)', () => {
  it('scores a full Conventional Commit with a why-body and ASCII text at 1', () => {
    const r = commitDisciplineScorer(
      outcome({
        lastCommit: {
          subject: 'feat(auth): add the login route',
          body: 'Users need to sign in before a session can start, so this wires the route.',
        },
      }),
    );
    expect(r.score).toBe(1);
    expect(r.signals).toMatchObject({ conventionalSubject: true, explainsWhy: true, asciiClean: true });
  });

  it('scores 0 when the run made no commit', () => {
    const r = commitDisciplineScorer(outcome({ lastCommit: undefined }));
    expect(r.score).toBe(0);
    expect(r.signals['conventionalSubject']).toBe(false);
  });

  it('fails the subject signal on a non-conventional subject', () => {
    const r = commitDisciplineScorer(outcome({ lastCommit: { subject: 'wip stuff', body: 'did some things here' } }));
    expect(r.signals['conventionalSubject']).toBe(false);
    expect(r.score).toBeLessThan(1);
  });

  it('fails the why signal on a bodyless commit', () => {
    const r = commitDisciplineScorer(outcome({ lastCommit: { subject: 'fix(api): handle null user', body: '' } }));
    expect(r.signals['explainsWhy']).toBe(false);
  });

  it('fails the ASCII signal on an em dash or emoji', () => {
    const em = commitDisciplineScorer(
      outcome({ lastCommit: { subject: 'feat(ui): add banner', body: 'Adds a banner — because reasons here.' } }),
    );
    expect(em.signals['asciiClean']).toBe(false);
    const emoji = commitDisciplineScorer(
      outcome({ lastCommit: { subject: 'feat(ui): add banner 🎉', body: 'Adds a banner so users notice it.' } }),
    );
    expect(emoji.signals['asciiClean']).toBe(false);
  });
});

describe('tddScorer (deterministic structural signals)', () => {
  const score = tddScorer({ targetSymbol: 'fizzbuzz' });

  it('scores 1 when a test file exists and references the target symbol', () => {
    const r = score(
      outcome({
        files: {
          'src/fizzbuzz.ts': 'export function fizzbuzz(n: number) { return String(n); }',
          'src/fizzbuzz.test.ts': "import { fizzbuzz } from './fizzbuzz';\nit('works', () => expect(fizzbuzz(3)).toBe('Fizz'));",
        },
      }),
    );
    expect(r.score).toBe(1);
    expect(r.signals).toMatchObject({ testExists: true, testTargetsCode: true });
  });

  it('fails testExists when only the implementation was written (no test)', () => {
    const r = score(outcome({ files: { 'src/fizzbuzz.ts': 'export function fizzbuzz() {}' } }));
    expect(r.signals['testExists']).toBe(false);
    expect(r.score).toBeLessThan(1);
  });

  it('fails testTargetsCode when a test file exists but never mentions the target', () => {
    const r = score(outcome({ files: { 'src/other.test.ts': "it('unrelated', () => expect(1).toBe(1));" } }));
    expect(r.signals['testExists']).toBe(true);
    expect(r.signals['testTargetsCode']).toBe(false);
  });
});
