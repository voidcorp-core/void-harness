// Where the harness declares what git should not see.
//
// The rules used to live in a marked block inside the project's `.gitignore`.
// That file is tracked, so the protection was branch-dependent while the assets
// it protects are not: check out a branch cut before the harness was installed,
// run the `git clean -fd` that habitually follows, and `.claude/`, `.agents/`,
// `.void/hooks/` and `.void/machine/` are all deleted -- the enforcement floor
// included, and the install receipt with it, so nothing is left to report the
// loss.
//
// `$GIT_COMMON_DIR/info/exclude` is what git documents for this: "patterns which
// are specific to a particular repository but which do not need to be shared
// with other related repositories". No commit contains it, so no checkout can
// revert it. It also hands `.gitignore` back to the project, which the harness
// no longer writes into at all.
//
// One precedence consequence, and it is the right way round: `.gitignore` wins
// over `info/exclude`, so a project rule always beats ours. `doctor` already
// asks git rather than trusting either file, which is how a project rule that
// shadows us gets reported instead of silently winning.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { gitignoreBlock, patchGitignore } from '@voidcorp/hook-runner';

/** What a write did, so the caller can report it without re-reading the file. */
export type ExcludeOutcome = 'written' | 'unchanged' | 'skipped';

/**
 * The exclude file git actually reads from `projectRoot`, or undefined when the
 * directory is not in a repository.
 *
 * Resolved by asking git, never by joining `.git/info/exclude` onto the root. In
 * a linked worktree `.git` is a file pointing elsewhere, and the exclude file
 * lives in the shared common directory; a path built by hand would name a file
 * git never reads. Autopilot workers run in linked worktrees, so that is the
 * ordinary case here rather than the exotic one.
 */
export function excludeFilePath(projectRoot: string): string | undefined {
  const probe = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (probe.status !== 0) return undefined;
  const reported = probe.stdout.trim();
  if (reported === '') return undefined;
  // git answers relative to the working directory in a plain repository and
  // absolutely from a linked worktree. Both are resolved against the root.
  return isAbsolute(reported) ? reported : resolve(projectRoot, reported);
}

/**
 * Add or refresh the harness block in the repository's exclude file.
 *
 * Idempotent, and it never disturbs a line the developer put there themselves:
 * git seeds this file with a comment header, and editors leave their own
 * droppings in it. Returns `skipped` outside a repository, which is not an
 * error -- `init` runs in projects that are not versioned yet, and a project
 * with no git has nothing to hide from it.
 */
export function writeExcludeBlock(
  projectRoot: string,
  ownedPaths: readonly string[] = [],
): ExcludeOutcome {
  const path = excludeFilePath(projectRoot);
  if (path === undefined) return 'skipped';
  let original = '';
  try {
    original = existsSync(path) ? readFileSync(path, 'utf8') : '';
  } catch {
    // Unreadable is treated as absent: the write below either succeeds and fixes
    // it, or throws where the caller can report it.
    original = '';
  }
  // The same marked block as before, so a project migrating from the `.gitignore`
  // era recognises it, and so one function keeps deciding what the rules ARE.
  // `ownedPaths` names the units no pattern can tell from the project's own --
  // the agents. Absent, they simply stay visible: a harness agent committed by
  // mistake is a diff somebody can see, where a project agent hidden by mistake
  // is work nobody notices leaving.
  const patched = patchGitignore(original, ownedPaths);
  if (patched === original) return 'unchanged';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, patched);
  return 'written';
}

/** The rules themselves, for a caller that needs to show them. */
export { gitignoreBlock as harnessIgnoreRules };
