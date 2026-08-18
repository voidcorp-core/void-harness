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
    (line, path) => {
      if (/from\s+['"]drizzle-orm|JSON\.(?:stringify|parse)|typeof.*===\s*['"]null/.test(line)) { // allow-null: this rule is about the literal
        return false;
      }
      // A React component renders nothing by returning the literal, and there is
      // no other spelling of it. Asking for one made every guard clause in a
      // .tsx carry an `allow-null:` comment, which teaches people the marker is
      // noise. The exemption covers that single form in a file holding JSX, not
      // the use of it as a value there.
      // Subtract the exempted form, then judge whatever is left: the guard
      // clause `if (!user) return null;` is the shape components actually take,
      // and a line that both renders nothing and uses the literal as a value is
      // still refused.
      const code = path.endsWith('.tsx')
        ? codeOnly(line).replace(/\breturn\s+null\b/g, '') // allow-null: the exempted form
        : codeOnly(line);
      return /\bnull\b/.test(code); // allow-null: this rule is about the literal
    },
    'allow-null:',
  );
  return evidenceVerdict(
    'NULL_IN_TYPESCRIPT',
    'null literal detected; prefer undefined or an explicit Option type',
    evidence,
  );
}
