import type {
  NormalizedEdit,
  RuleVerdict,
} from '../enforcement/types.js';
import {
  evidenceVerdict,
  isGeneratedPath,
  isTestPath,
  normalizedPath,
} from './source-helpers.js';

const INTER = /font-family[^;]*\bInter\b|font-\[.?Inter|fontFamily[^,]*\bInter\b/i;
const GRADIENT =
  /(?:from|to)-(?:purple|indigo|violet|fuchsia)-\d+[^"' ]*[^"']*(?:from|to)-(?:blue|cyan|teal|sky|indigo)-\d+|linear-gradient\([^)]*(?:purple|indigo|violet)[^)]*(?:blue|cyan|teal)/i;
const GREY_ON_COLOR =
  /\btext-(?:gray|grey|slate|zinc|neutral)-\d+\b[^"']*\bbg-(?:indigo|purple|blue|violet|fuchsia|emerald|rose|pink)-\d+\b/i;
const NESTED_CARD =
  /class(?:Name)?="[^"]*\bcard\b[^"]*"[^>]*>[^<]*<[^>]*class(?:Name)?="[^"]*\bcard\b/i;

export function designSlop(edits: readonly NormalizedEdit[]): RuleVerdict {
  const evidence: string[] = [];
  for (const edit of edits) {
    const path = normalizedPath(edit.path);
    if (
      !/\.(?:tsx|jsx|css|scss)$/.test(path)
      || isTestPath(path)
      || isGeneratedPath(path)
    ) {
      continue;
    }
    edit.addedContent.split(/\r?\n/).forEach((line, index) => {
      if (/allow-design-slop:/.test(line)) return;
      const code = line.replace(/`[^`]*`|\/\*.*?\*\/|\/\/.*$/g, '');
      if (INTER.test(code)) evidence.push(`${path}:${index + 1}: default Inter font`);
      if (GRADIENT.test(code)) evidence.push(`${path}:${index + 1}: cliché gradient`);
      if (GREY_ON_COLOR.test(code)) evidence.push(`${path}:${index + 1}: grey text on color`);
    });
    if (
      NESTED_CARD.test(edit.addedContent)
      && !edit.addedContent.includes('allow-design-slop:')
    ) {
      evidence.push(`${path}: card nested directly inside card`);
    }
  }
  return evidenceVerdict(
    'GENERIC_AI_DESIGN_TELL',
    'conservative generic-design tell detected; apply the project visual language',
    evidence,
  );
}
