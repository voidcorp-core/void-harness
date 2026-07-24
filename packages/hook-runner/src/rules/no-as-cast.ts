import type {
  NormalizedEdit,
  RuleVerdict,
} from '../enforcement/types.js';
import {
  evidenceVerdict,
  isGeneratedPath,
  isTestPath,
  lineEvidence,
} from './source-helpers.js';

const ASSERTION_CAST = /\bas\s+[A-Z][A-Za-z0-9_]*/;

export function noAsCast(edits: readonly NormalizedEdit[]): RuleVerdict {
  const evidence = lineEvidence(
    edits,
    (path) =>
      /\.(?:ts|tsx)$/.test(path)
      && !isTestPath(path)
      && !path.endsWith('.d.ts')
      && !isGeneratedPath(path),
    (line) => ASSERTION_CAST.test(line),
    'allow-as-cast:',
  );
  return evidenceVerdict(
    'TYPESCRIPT_ASSERTION_CAST',
    'assertion cast detected; prefer narrowing, a type guard, a generic or boundary parsing',
    evidence,
  );
}
