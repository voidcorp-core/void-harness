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

const ANY = /:\s*any\b|<any>|\bas\s+any\b/;

export function noAny(edits: readonly NormalizedEdit[]): RuleVerdict {
  const evidence = lineEvidence(
    edits,
    (path) =>
      /\.(?:ts|tsx)$/.test(path)
      && !isTestPath(path)
      && !path.endsWith('.d.ts')
      && !isGeneratedPath(path),
    (line) => ANY.test(line),
    'allow-any:',
  );
  return evidenceVerdict(
    'TYPESCRIPT_ANY',
    'any weakens the type boundary; use a precise type or unknown plus narrowing',
    evidence,
  );
}
