/**
 * Autopilot merges in exactly one place, one way, and nowhere else.
 *
 * It used to merge nowhere, and "publishes; it does not merge" was the safety
 * argument of the whole design. The union-is-read-before-it-merges decision
 * moved that line rather than removing it: under `mergeGate: union-reviewed` an
 * integration pull request may merge itself into a branch that does not deploy,
 * once a fresh-context adversarial reading of the whole diff came back clean.
 * A boundary nobody could cross was replaced by one file allowed to cross it.
 *
 * So the gate got narrower, not weaker. `merge-plan.ts` is the only source that
 * may emit `gh pr merge`; it must bind the merge to the head the grant read, and
 * it may not arm one for later, bypass the protection, or rewrite the range the
 * chain observes afterwards. Everywhere else, merging is still absent.
 *
 * It remains the boundary most likely to be crossed by a helpful edit — arming
 * `--auto` "just for low-risk clusters" is a two-word change that reads as a
 * convenience and removes the reading.
 *
 * So it is a gate. What it inspects is the argv the code can actually emit, not
 * the words the code uses: a comment saying "never merge" and a guard rejecting
 * `--auto-merge` both name the thing they forbid, and a substring scan would
 * fail the code that enforces the rule while passing code that merges through a
 * variable. The command literals are where merging would have to appear.
 *
 * The superseded `lib/backlog/` engine still carries the auto-merge it was built
 * with; the cutover deletes it wholesale, and pinning its shape here would only
 * protect code on its way out.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const SURFACES = ['packages/cli/src/lib/autopilot', 'packages/cli/src/commands/autopilot.ts'];

/** The one source allowed to emit a merge, named so the gate can be exhaustive. */
const MERGE_SOURCE = 'packages/cli/src/lib/autopilot/merge-plan.ts';

function filesUnder(relative: string): string[] {
  const absolute = join(ROOT, relative);
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(relative, entry.name)) : [join(absolute, entry.name)],
  );
}

/** Active source only: a test may legitimately name what it forbids. */
const ACTIVE = SURFACES.flatMap(filesUnder)
  .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
  .map((path) => ({ path: path.slice(ROOT.length), text: readFileSync(path, 'utf8') }));

interface Argv {
  readonly file: string;
  readonly source: string;
  readonly tokens: readonly string[];
}

/**
 * Every array literal that starts with `'git'` or `'gh'`, read to its matching
 * bracket. Anchoring on the program name rather than on every `[` is what keeps
 * this exhaustive: a scan that walks all brackets consumes `string[]` and `[]`
 * first and silently skips the command that follows.
 */
function argvLiterals(file: string, text: string): Argv[] {
  const found: Argv[] = [];
  const start = /\[\s*'(?:git|gh)'/g;

  for (const match of text.matchAll(start)) {
    let depth = 0;
    let end = match.index;
    for (; end < text.length; end += 1) {
      if (text[end] === '[') depth += 1;
      else if (text[end] === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const source = text.slice(match.index, end + 1);
    found.push({
      file,
      source: source.replace(/\s+/g, ' '),
      // Quoted words only: an interpolated value is not a subcommand.
      tokens: [...source.matchAll(/'([^']*)'/g)].map((token) => token[1] ?? ''),
    });
  }
  return found;
}

const COMMANDS = ACTIVE.flatMap((file) => argvLiterals(file.path, file.text));

function violating(predicate: (command: Argv) => boolean): string[] {
  return COMMANDS.filter(predicate).map((command) => `${command.file}: ${command.source}`);
}

describe('the argv the autopilot surface can emit', () => {
  it('was actually collected, so an empty result means clean and not mis-scoped', () => {
    expect(ACTIVE.length).toBeGreaterThan(20);
    expect(COMMANDS.length).toBeGreaterThan(4);
    // Sanity on the extractor itself: the publish push is one of the commands.
    expect(COMMANDS.some((command) => command.tokens[0] === 'git' && command.tokens[1] === 'push')).toBe(true);
  });

  const MERGES = (command: Argv): boolean => command.tokens[0] === 'gh' && command.tokens.includes('merge');

  it('asks gh to merge a pull request from one file only', () => {
    expect(violating((command) => MERGES(command) && command.file !== MERGE_SOURCE)).toEqual([]);
    // And that file still does it, so a rename cannot empty this gate silently.
    expect(COMMANDS.filter(MERGES).map((command) => command.file)).toEqual([MERGE_SOURCE]);
  });

  // What the one permitted merge may not do. `--auto` merges a tree nobody
  // re-read, `--admin` bypasses the protection the run proved, and both rewrite
  // flags destroy the range the chain observes on the base afterwards.
  it('binds that merge to the head the grant read, and neither arms nor rewrites it', () => {
    const merge = COMMANDS.find(MERGES);

    expect(merge?.tokens).toContain('--match-head-commit');
    expect(merge?.tokens).toContain('--merge');
    for (const forbidden of ['--auto', '--admin', '--squash', '--rebase', '--delete-branch']) {
      expect(merge?.tokens, forbidden).not.toContain(forbidden);
    }
  });

  it('never arms an auto-merge flag', () => {
    expect(violating((command) => command.tokens.some((token) => token.startsWith('--auto')))).toEqual([]);
  });

  it('never calls a merge endpoint through the API client', () => {
    expect(
      violating(
        (command) => command.tokens[0] === 'gh' && command.tokens.some((token) => /\/merge\b/.test(token)),
      ),
    ).toEqual([]);
  });

  it('never forces a push', () => {
    const forced = (command: Argv): boolean =>
      command.tokens.includes('push') &&
      command.tokens.some(
        (token) => token === '-f' || token.startsWith('--force') || token.startsWith('+refs/'),
      );

    expect(violating(forced)).toEqual([]);
  });

  it('never pushes a worker branch', () => {
    expect(
      violating(
        (command) =>
          command.tokens.includes('push') &&
          command.source.includes('autopilot-worker'),
      ),
    ).toEqual([]);
  });
});
