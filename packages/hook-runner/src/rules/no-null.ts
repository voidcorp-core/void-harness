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

function codeOnly(line: string): string {
  return line
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '');
}

export function noNull(edits: readonly NormalizedEdit[]): RuleVerdict {
  const evidence = lineEvidence(
    edits,
    (path) =>
      /\.(?:ts|tsx)$/.test(path)
      && !isTestPath(path)
      && !path.endsWith('.d.ts')
      && !isGeneratedPath(path),
    (line) => {
      if (/from\s+['"]drizzle-orm|JSON\.(?:stringify|parse)|typeof.*===\s*['"]null/.test(line)) {
        return false;
      }
      return /\bnull\b/.test(codeOnly(line));
    },
    'allow-null:',
  );
  return evidenceVerdict(
    'NULL_IN_TYPESCRIPT',
    'null literal detected; prefer undefined or an explicit Option type',
    evidence,
  );
}
