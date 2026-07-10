import type { HeadToHeadReport, Judge, JudgeGrid, RunOutcome, ScoreResult, Scorer } from './types.js';

/**
 * Build an async Scorer that delegates to an injected LLM judge — the LAST RESORT
 * for a skill whose value is a diagnosis, not a file edit. A crashed run or an
 * empty transcript scores 0 WITHOUT spending a judge call: there is nothing to
 * judge, and a silent run is a failure regardless of the rubric. The judge is a
 * port, so the runner's aggregation stays deterministic and unit-tested with a fake.
 */
export function judgeScorer(judge: Judge, grid: JudgeGrid): Scorer {
  return async (outcome: RunOutcome): Promise<ScoreResult> => {
    if (!outcome.ok || outcome.transcript.trim() === '') {
      return { score: 0, signals: {} };
    }
    const verdict = await judge({ transcript: outcome.transcript, criteria: grid.criteria });
    return { score: verdict.score, signals: verdict.signals };
  };
}

/**
 * Aggregate the per-run blind verdicts of a head-to-head run into a report. The
 * winners are already NORMALIZED by the runner to A = distillate / B = source
 * (the runner un-blinds the position swap it applied); this function only counts
 * and names the winner. A strict-majority rule: equal A/B is a tie regardless of
 * how many ties were recorded.
 */
export function aggregateHeadToHead(
  winners: readonly ('A' | 'B' | 'tie')[],
  meta: { readonly skill: string; readonly title: string; readonly runs: number },
): HeadToHeadReport {
  const aWins = winners.filter((w) => w === 'A').length;
  const bWins = winners.filter((w) => w === 'B').length;
  const ties = winners.filter((w) => w === 'tie').length;
  const verdict = aWins > bWins ? 'distillate-better' : bWins > aWins ? 'source-better' : 'tie';
  return { skill: meta.skill, title: meta.title, runs: winners.length, aWins, bWins, ties, verdict };
}
