// The two roots a command runs against, and why they are not one.
//
// A command reads and writes code in the WORK TREE: the directory it was run
// in. It also reads what `void-harness init` installed -- `.claude/agents`,
// `.claude/skills`, `.void/installed`, the hook bundle -- and that is a
// property of the REPOSITORY, exactly like the git config or the
// `.git/info/exclude` file that hides those assets from git. In the main
// checkout the two coincide. In a linked worktree they do not: `git worktree
// add` restores tracked files only, and the install is deliberately untracked,
// so a worker that looks for its panel next to its code finds nothing
// (run-2026-09-02-chain-b, DEV-732).
//
// Git already keeps the distinction. `git rev-parse --show-toplevel` names the
// current working tree; `git worktree list --porcelain` names every working
// tree of the repository and lists the main one first (git-worktree(1), `list`
// and "Porcelain Format", git 2.50). The main working tree is where the harness
// was installed, because `init` refuses to run anywhere else in a repository.
//
// `--git-common-dir` (git-rev-parse(1)) was considered and not used: its parent
// is the main working tree only under the default layout, and a repository
// created with `--separate-git-dir` breaks that assumption silently. The
// worktree listing is the documented answer to "where is the main working
// tree", so it is the one asked.

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ProjectRoots {
  /** Where the command reads and writes code. Always the directory it ran in. */
  readonly workRoot: string;
  /**
   * Where the harness is installed. Equal to `workRoot` outside git and in the
   * main checkout; the main checkout's path from a linked worktree.
   */
  readonly installRoot: string;
}

const GIT_TIMEOUT_MS = 5_000;
const GIT_MAX_OUTPUT_BYTES = 1_000_000;

/** The physical path, so `/var/...` and `/private/var/...` never read as two roots. */
function canonical(path: string): string {
  try {
    return realpathSync(resolve(path));
  } catch {
    return resolve(path);
  }
}

function git(cwd: string, args: readonly string[]): string | undefined {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return undefined;
  return result.stdout;
}

/**
 * The main working tree of the repository `cwd` belongs to, or undefined when
 * there is none: outside git, in a bare repository, or with a git too old to
 * answer, in which case the caller keeps one root and today's behaviour.
 */
function mainWorkingTree(cwd: string): string | undefined {
  // One attribute per line, a blank line closes a record. The first record is
  // the main working tree by contract, and its first attribute is always
  // `worktree`. Without `-z`: it arrived in git 2.36 while `list --porcelain`
  // dates from 2.7, and a repository path carrying a newline is not a case
  // worth raising the floor for.
  const listing = git(cwd, ['worktree', 'list', '--porcelain']);
  if (listing === undefined) return undefined;
  const [first = ''] = listing.split(/\r?\n\r?\n/);
  const attributes = first.split(/\r?\n/);
  const [head = ''] = attributes;
  if (!head.startsWith('worktree ')) return undefined;
  if (attributes.includes('bare')) return undefined;
  return head.slice('worktree '.length);
}

/**
 * Resolve the roots for a command run in `cwd`, once, so every caller reads the
 * same answer. Never throws: a directory git cannot describe is its own
 * installation, which is what every command assumed before this existed.
 */
export function resolveProjectRoots(cwd: string = process.cwd()): ProjectRoots {
  const workRoot = canonical(cwd);
  const toplevel = git(workRoot, ['rev-parse', '--show-toplevel'])?.trim();
  if (toplevel === undefined || toplevel === '') {
    return Object.freeze({ workRoot, installRoot: workRoot });
  }
  const main = mainWorkingTree(workRoot);
  if (main === undefined || canonical(main) === canonical(toplevel)) {
    return Object.freeze({ workRoot, installRoot: workRoot });
  }
  return Object.freeze({ workRoot, installRoot: canonical(main) });
}
