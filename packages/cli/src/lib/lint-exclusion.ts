// Keep the harness out of the consumer's lint.
//
// `.claude/` holds files this repo wrote, in formats their engines define. The
// autopilot workflow script is the sharp case: valid for the Workflow engine,
// rejected by any standard JavaScript parser, because it carries
// `export const meta` and a top-level `return` at once. A project that lints
// `**/*.js` then fails on code it does not own and cannot fix.
//
// The harness caused that, so the harness clears it — at install time, where a
// single decision covers every consumer, instead of leaving each one to
// discover it three files into an afternoon.
//
// This module reads and reports; it never writes. Two reasons, both learned the
// hard way. The config belongs to the project, and the install transaction
// rolls back byte-for-byte only over files it owns — an edit here would survive
// a failed install that claimed to have restored everything. And appending
// `!.claude` to a config with no `files.includes` produces a lone negation,
// which per Biome's documentation matches nothing at all: the repair would have
// silently stopped the project linting anything.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** What we add to a Biome `files.includes` list. */
export const HARNESS_LINT_EXCLUSION = '!.claude';

/** Spellings that already mean "do not lint `.claude`". */
const EQUIVALENT = new Set(['!.claude', '!.claude/**', '!.claude/**/*', './!.claude', '!./.claude']);

const BIOME_FILES = ['biome.json', 'biome.jsonc'];
const OTHER_LINTERS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.oxlintrc.json',
];

/** What the project's linter config says about `.claude`, read only. */
export type LintExclusionState =
  | { readonly kind: 'excluded'; readonly file: string }
  | { readonly kind: 'missing'; readonly file: string; readonly instruction: string }
  | { readonly kind: 'manual'; readonly file: string; readonly instruction: string }
  | { readonly kind: 'no-linter' };

/**
 * Read-only inspection, for `doctor`.
 *
 * A diagnostic that repairs what it measures cannot be run to find out whether
 * something is wrong — it would always report health, having just created it.
 */
export async function inspectHarnessLintExclusion(projectRoot: string): Promise<LintExclusionState> {
  const biome = BIOME_FILES.map((name) => join(projectRoot, name)).find((path) => existsSync(path));
  if (biome !== undefined) {
    const name = biome.slice(projectRoot.length + 1);
    const text = await readFile(biome, 'utf8');
    if (!isPlainJson(text)) {
      return manual(name, 'this config is not plain JSON, so it cannot be rewritten safely');
    }
    const config = JSON.parse(text) as { files?: { includes?: unknown } };
    const includes = Array.isArray(config.files?.includes) ? (config.files.includes as string[]) : undefined;
    if (includes?.some((entry) => EQUIVALENT.has(entry.trim())) === true) {
      return { kind: 'excluded', file: name };
    }
    return {
      kind: 'missing',
      file: name,
      instruction: `add \`${HARNESS_LINT_EXCLUSION}\` to files.includes in ${name} (keep a positive pattern such as \`**\` before it — a lone negation matches nothing in Biome)`,
    };
  }
  const other = OTHER_LINTERS.find((name) => existsSync(join(projectRoot, name)));
  if (other !== undefined) {
    return manual(other, 'this linter is configured in code');
  }
  return { kind: 'no-linter' };
}

function manual(file: string, why: string): { kind: 'manual'; file: string; instruction: string } {
  return {
    kind: 'manual',
    file,
    instruction: `${why}: add \`${HARNESS_LINT_EXCLUSION}\` to ${file} (after a positive pattern such as \`**\`) so the harness is not linted as project source`,
  };
}

/** True when the text is plain JSON we can rewrite without losing anything. */
function isPlainJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function indentOf(text: string): number {
  return /^\s*\n?[ ]{4}"/.test(text) ? 4 : 2;
}
