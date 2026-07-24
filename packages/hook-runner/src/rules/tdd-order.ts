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
  return /\.(?:md|mdx|txt)$/.test(path)
    || /(^|\/)docs\//.test(path)
    || /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path)
    || /\.d\.ts$/.test(path)
    || /\/(?:tests?|__tests__)\/fixtures\/|\/seed\/|\/migrations\/|\/drizzle\/meta\/|\/codemods?\//.test(path)
    || /\/__generated__\//.test(path)
    || matches(path, spikeGlobs);
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
