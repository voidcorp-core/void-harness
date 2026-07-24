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

const CONSOLE = /\bconsole\.(?:log|error|warn|info|debug)\b/;

export function noConsole(edits: readonly NormalizedEdit[]): RuleVerdict {
  const evidence = lineEvidence(
    edits,
    (path) =>
      /\.(?:ts|tsx|js|jsx)$/.test(path)
      && !/(^|\/)scripts\//.test(path)
      && !isTestPath(path)
      && !isGeneratedPath(path),
    (line) => CONSOLE.test(line),
    'allow-console:',
  );
  return evidenceVerdict(
    'CONSOLE_IN_SOURCE',
    'console call detected in source; use the project logger',
    evidence.map((item) => `console.* in ${item}`),
  );
}
