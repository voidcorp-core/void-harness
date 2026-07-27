import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  EvalCase,
  RunOnce,
  RunOutcome,
  ScoreResult,
} from './types.js';

const OUTCOME: RunOutcome = {
  ok: true,
  costUsd: 0,
  files: { 'src/example.ts': 'export const value = 1;\n' },
  lastCommit: undefined,
  transcript: 'Verdict: blocked.',
  eventLog: '{"kind":"specialist.completed"}\n',
};

describe('eval domain types', () => {
  it('composes a run port and deterministic scorer without losing replay data', async () => {
    const runOnce: RunOnce = () => Promise.resolve(OUTCOME);
    const evalCase = {
      skill: 'ticket-runner',
      title: 'review with replay evidence',
      prompt: 'Review the fixture.',
      fixture: OUTCOME.files,
      scorer: (outcome): ScoreResult => ({
        score: outcome.eventLog === undefined ? 0 : 1,
        signals: { replayable: outcome.eventLog !== undefined },
      }),
    } satisfies EvalCase;

    const outcome = await runOnce({ skillBody: 'ticket-runner instructions' });
    const score = await evalCase.scorer(outcome);

    expectTypeOf(evalCase).toMatchTypeOf<EvalCase>();
    expect(outcome.eventLog).toBe(OUTCOME.eventLog);
    expect(score).toEqual({ score: 1, signals: { replayable: true } });
  });
});
