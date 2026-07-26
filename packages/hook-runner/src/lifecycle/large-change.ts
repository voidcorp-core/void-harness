import type { RuleVerdict } from '../enforcement/types.js';
import { allow } from '../rules/verdict.js';

export interface LargeChangeAssessment {
  readonly addedLines: number;
  readonly threshold: number;
  readonly justified: boolean;
}

export function parseAddedLines(numstat: string): number {
  return numstat.split(/\r?\n/).reduce((total, line) => {
    const [added] = line.split('\t', 1);
    const count = Number(added);
    if (!Number.isSafeInteger(count) || count < 0) return total;
    return Math.min(Number.MAX_SAFE_INTEGER, total + count);
  }, 0);
}

export function hasLargeChangeJustification(text: string): boolean {
  return /^\s*large-cl-justification\s*:\s*\S.*$/imu.test(text);
}

export function assessLargeChange(
  assessment: LargeChangeAssessment,
): RuleVerdict {
  if (assessment.addedLines <= assessment.threshold || assessment.justified) {
    return allow();
  }
  return {
    allow: true,
    code: 'LARGE_CHANGE_WARNING',
    message:
      `change adds ${assessment.addedLines} lines (threshold ${assessment.threshold}); ` +
      'split it or justify why it is atomic',
    evidence: ['large-cl-justification: <reason>'],
  };
}
