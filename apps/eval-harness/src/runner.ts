import { aggregateHeadToHead } from './judge.js';
import type {
  ConditionResult,
  EvalCase,
  EvalReport,
  HeadToHeadJudge,
  HeadToHeadReport,
  JudgeGrid,
  RunOnce,
  RunOutcome,
} from './types.js';

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
  // await each score: a judgeScorer is async (it calls the injected LLM judge);
  // a deterministic scorer returns synchronously and awaiting it is a no-op.
  const scores: number[] = [];
  for (const o of outcomes) scores.push((await evalCase.scorer(o)).score);
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

/**
 * Head-to-head: same fixture, condition A = the DISTILLATE prose, condition B = the
 * SOURCE prose. Run each N times, then a BLIND judge compares the i-th A-transcript
 * against the i-th B-transcript. The judge never learns which side is which; to
 * cancel position bias the sides are swapped on odd indices (deterministic, not
 * random — so the run is reproducible), and the winner is un-blinded back to
 * A (distillate) / B (source) before aggregation. Answers "is the distillate as
 * good as the source?" directly, which with/without cannot.
 */
export async function runHeadToHead(
  meta: { readonly skill: string; readonly title: string },
  distillateBody: string,
  sourceBody: string,
  runOnce: RunOnce,
  judge: HeadToHeadJudge,
  grid: JudgeGrid,
  runs: number,
): Promise<HeadToHeadReport> {
  const distillate: RunOutcome[] = [];
  const source: RunOutcome[] = [];
  for (let i = 0; i < runs; i += 1) distillate.push(await runOnce({ skillBody: distillateBody }));
  for (let i = 0; i < runs; i += 1) source.push(await runOnce({ skillBody: sourceBody }));

  const winners: ('A' | 'B' | 'tie')[] = [];
  for (let i = 0; i < runs; i += 1) {
    const swap = i % 2 === 1; // odd runs present the source on the left — cancels position bias
    const dTx = distillate[i]?.transcript ?? '';
    const sTx = source[i]?.transcript ?? '';
    const left = swap ? sTx : dTx;
    const right = swap ? dTx : sTx;
    const verdict = await judge({ a: left, b: right, criteria: grid.criteria });
    // Un-blind: 'A' means "left won". Map left/right back to distillate/source.
    const winner =
      verdict.winner === 'tie' ? 'tie' : (verdict.winner === 'A') === !swap ? 'A' : 'B';
    winners.push(winner);
  }
  return aggregateHeadToHead(winners, { skill: meta.skill, title: meta.title, runs });
}
