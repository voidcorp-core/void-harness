import type { EvalReport } from './types.js';

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
const usd = (n: number): string => `$${n.toFixed(4)}`;
const signed = (n: number): string => `${n >= 0 ? '+' : ''}${pct(n)}`;

/** Render an EvalReport as a compact, archivable markdown block. Pure. */
export function formatReport(r: EvalReport): string {
  return [
    `# eval: ${r.skill} — ${r.title}`,
    '',
    `verdict: **${r.verdict}**  (delta ${signed(r.delta)}, ${r.runsPerCondition} runs/condition)`,
    '',
    `| condition | mean score | ok runs | cost |`,
    `|---|---|---|---|`,
    `| with skill | ${pct(r.withSkill.meanScore)} | ${r.withSkill.okRuns}/${r.runsPerCondition} | ${usd(r.withSkill.costUsd)} |`,
    `| without skill | ${pct(r.withoutSkill.meanScore)} | ${r.withoutSkill.okRuns}/${r.runsPerCondition} | ${usd(r.withoutSkill.costUsd)} |`,
    '',
    `total cost: ${usd(r.totalCostUsd)}`,
    '',
  ].join('\n');
}
