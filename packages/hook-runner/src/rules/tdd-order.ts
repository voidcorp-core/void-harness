import type {
  NormalizedEdit,
  RuleVerdict,
} from '../enforcement/types.js';
import { allow, block } from './verdict.js';

export type TddMode = 'auto' | 'strict' | 'souple' | 'exploratory';

export interface TddOrderInput {
  readonly edits: readonly NormalizedEdit[];
  readonly mode: TddMode;
  readonly businessGlobs: readonly string[];
  readonly spikeGlobs: readonly string[];
  readonly existingHeaders: Readonly<Record<string, string>>;
  readonly siblingTests: ReadonlySet<string>;
}

function globRegExp(glob: string): RegExp {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? '';
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*';
      index += 1;
    } else if (char === '*') {
      pattern += '[^/]*';
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${pattern}$`);
}

function matches(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globRegExp(glob).test(path));
}

function bypass(path: string, spikeGlobs: readonly string[]): boolean {
  return !/\.(?:ts|tsx|js|jsx)$/.test(path)
    || /(^|\/)docs\//.test(path)
    || /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path)
    || /\.d\.ts$/.test(path)
    || /\/(?:tests?|__tests__)\/fixtures\/|\/seed\/|\/migrations\/|\/drizzle\/meta\/|\/codemods?\//.test(path)
    || /\/__generated__\//.test(path)
    || matches(path, spikeGlobs);
}

// A module that only re-exports carries no behaviour: the test one would write
// for it asserts that an export exists, which the compiler already proves. The
// property is one of the CONTENT, not of the path, so it lives beside `bypass()`
// rather than inside it, and a barrel that gains one line of logic stops being
// exempt. Both the file as it stands and the fragment being written must hold,
// so an edit that introduces logic is covered again.
const MAX_TOP_LEVEL_STATEMENTS = 512;
const DIRECTIVE = /^(['"])use [a-z][a-z ]*\1\s*;?/;
const TYPE_IMPORT = /^import\s+type\s+[^;'"]*from\s*(['"])[^'"]*\1\s*;?/;
const RE_EXPORT =
  /^export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s*(?:from\s*(['"])[^'"]*\1)?\s*;?/;

function endOfLiteral(source: string, start: number): number | undefined {
  const quote = source[start] ?? '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === quote) return index;
  }
  return undefined;
}

/** Drops comments while preserving string literals; undefined when malformed. */
function withoutComments(source: string): string | undefined {
  let output = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      if (end === -1) return output;
      index = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) return undefined;
      index = end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const end = endOfLiteral(source, index);
      if (end === undefined) return undefined;
      output += source.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

function isPureReExport(source: string): boolean {
  const stripped = withoutComments(source);
  if (stripped === undefined) return false;
  let rest = stripped.replace(/\s+/g, ' ').trim();
  for (let count = 0; rest !== '' && count < MAX_TOP_LEVEL_STATEMENTS; count += 1) {
    const statement =
      DIRECTIVE.exec(rest) ?? TYPE_IMPORT.exec(rest) ?? RE_EXPORT.exec(rest) ?? undefined;
    if (statement === undefined) return false;
    rest = rest.slice(statement[0].length).trim();
  }
  return rest === '';
}

function carriesNoBehaviour(existing: string, added: string): boolean {
  return isPureReExport(existing) && isPureReExport(added);
}

function fileMode(path: string, input: TddOrderInput): TddMode {
  const header = (input.existingHeaders[path] ?? '').split(/\r?\n/).slice(0, 5).join('\n');
  const marker = header.match(/\/\/\s*tdd-mode:\s*(strict|souple|exploratory)/)?.[1];
  return marker === 'strict' || marker === 'souple' || marker === 'exploratory'
    ? marker
    : input.mode;
}

function siblingFor(path: string): string {
  if (path.endsWith('.tsx')) return `${path.slice(0, -4)}.test.tsx`;
  if (path.endsWith('.ts')) return `${path.slice(0, -3)}.test.ts`;
  if (path.endsWith('.jsx')) return `${path.slice(0, -4)}.test.jsx`;
  if (path.endsWith('.js')) return `${path.slice(0, -3)}.test.js`;
  return `${path}.test`;
}

export function tddOrder(input: TddOrderInput): RuleVerdict {
  const warnings: string[] = [];
  for (const edit of input.edits) {
    const path = edit.path.replaceAll('\\', '/');
    if (bypass(path, input.spikeGlobs) || !matches(path, input.businessGlobs)) continue;
    if (carriesNoBehaviour(input.existingHeaders[path] ?? '', edit.addedContent)) continue;
    const mode = fileMode(path, input);
    if (mode === 'exploratory') continue;
    const sibling = siblingFor(path);
    if (input.siblingTests.has(sibling)) continue;
    const evidence = `${path} -> ${sibling}`;
    if (mode === 'souple') {
      warnings.push(evidence);
      continue;
    }
    return block(
      'TDD_SIBLING_TEST_MISSING',
      'missing sibling test: production edit requires one in strict/auto mode',
      [evidence],
    );
  }
  return warnings.length === 0
    ? allow()
    : {
        allow: true,
        code: 'TDD_SIBLING_TEST_WARNING',
        message: 'warning: souple mode, sibling test missing',
        evidence: warnings,
      };
}
