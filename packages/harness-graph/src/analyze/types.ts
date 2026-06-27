import type { GraphModel } from '../model/types.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  readonly kind: string;
  readonly severity: Severity;
  readonly nodes: readonly string[];
  readonly evidence: string;
  readonly suggestion: string;
}

export interface AnalyzeCtx {
  readonly usedSkillNames: ReadonlySet<string>;
}

export type Detector = (model: GraphModel, ctx: AnalyzeCtx) => Finding[];

export function isError(f: Finding): boolean {
  return f.severity === 'error';
}
