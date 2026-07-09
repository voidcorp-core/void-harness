import type { ConditionResult, EvalCase, EvalReport, RunOnce, RunOutcome } from './types.js';

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Run one condition N times, score each outcome, aggregate. A crashed run
 * (outcome.ok === false) still gets scored — its empty state scores ~0 — so an
 * unreliable skill is penalised, not hidden; okRuns surfaces the reliability. */
async function runCondition(
  evalCase: EvalCase,
  runOnce: RunOnce,
  skillBody: string | undefined,
  runs: number,
): Promise<ConditionResult> {
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < runs; i += 1) {
    outcomes.push(await runOnce({ skillBody }));
  }
  const scores = outcomes.map((o) => evalCase.scorer(o).score);
  return {
    scores,
    meanScore: mean(scores),
    okRuns: outcomes.filter((o) => o.ok).length,
    costUsd: sum(outcomes.map((o) => o.costUsd)),
  };
}

/**
 * Run the fixture task with the skill appended and without it, N times each, and
 * report the delta. The verdict is intentionally coarse (a threshold over the
 * mean, not a t-test): N is small and this is a signal, not a p-value. Raise N or
 * the threshold when a skill's effect is subtle.
 */
export async function runEval(
  evalCase: EvalCase,
  skillBody: string,
  runOnce: RunOnce,
  opts: { readonly runs?: number; readonly threshold?: number } = {},
): Promise<EvalReport> {
  const runs = opts.runs ?? 3;
  const threshold = opts.threshold ?? 0.15;

  const withSkill = await runCondition(evalCase, runOnce, skillBody, runs);
  const withoutSkill = await runCondition(evalCase, runOnce, undefined, runs);

  const delta = withSkill.meanScore - withoutSkill.meanScore;
  const verdict = delta > threshold ? 'skill-helps' : delta < -threshold ? 'skill-hurts' : 'no-signal';

  return {
    skill: evalCase.skill,
    title: evalCase.title,
    runsPerCondition: runs,
    withSkill,
    withoutSkill,
    delta,
    verdict,
    totalCostUsd: withSkill.costUsd + withoutSkill.costUsd,
  };
}
