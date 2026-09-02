// The two roots a command runs against, and why they are not one.
//
// A command reads and writes code in the WORK TREE: the directory it was run
// in. It also reads what `void-harness init` installed -- `.claude/agents`,
// `.claude/skills`, `.void/installed`, the hook bundle -- and that is a
// property of the REPOSITORY, exactly like the git config or the
// `info/exclude` file that hides those assets from git. In the main checkout
// the two coincide. In a linked worktree they do not: `git worktree add`
// restores tracked files only, and the install is deliberately untracked, so
// a worker that looks for its panel next to its code finds nothing
// (run-2026-09-02-chain-b, DEV-732).
//
// Git keeps the distinction, with one trap. `git rev-parse --show-toplevel`
// names the current working tree; `git worktree list --porcelain` lists every
// working tree of the repository, the main one first (git-worktree(1), `list`
// and "Porcelain Format", git 2.50). But git builds that first path from the
// common directory with a trailing `/.git` stripped, so it is a working tree
// only under the default layout: in a submodule checkout it is
// `<super>/.git/modules/<name>`, under `--separate-git-dir` the git directory
// itself (measured on git 2.50.1). The listed path is therefore never trusted
// as a tree; git is asked for its toplevel. That honours `core.worktree`,
// which a submodule's git directory carries, and refuses where no working
// tree exists, which is the answer for `--separate-git-dir` and bare.
//
// `init` installs wherever it is run, a linked worktree included, and marks the
// tree with an install receipt under `.void/machine/` that git never carries.
// So from a linked worktree the receipt decides: the tree at hand when it holds
// one, the main working tree otherwise. `--git-common-dir` (git-rev-parse(1))
// was considered and not used: its parent is the main working tree only under
// the default layout, the same trap as the listing without the toplevel ask.

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { voidReadPath } from '@voidcorp/hook-runner';

export interface ProjectRoots {
  /** Where the command reads and writes code. Always the directory it ran in. */
  readonly workRoot: string;
  /**
   * Where the harness is installed. Equal to `workRoot` outside git, in the
   * main checkout, and in a linked worktree that holds an install receipt; the
   * main working tree's path from any other linked worktree.
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
 * git can name none: outside git, in a bare repository, under
 * `--separate-git-dir`, or with a git too old to answer. The caller then keeps
 * one root and today's behaviour.
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
  // The listed path may be the git directory rather than a tree (see the
  // header). Its toplevel, as git resolves it, is the working tree or nothing.
  const toplevel = git(head.slice('worktree '.length), ['rev-parse', '--show-toplevel'])?.trim();
  if (toplevel === undefined || toplevel === '') return undefined;
  return canonical(toplevel);
}

/** Whether `init` ran in `root`: the receipt it writes is hidden from git, so no checkout copies it. */
function holdsInstallReceipt(root: string): boolean {
  return existsSync(voidReadPath(root, 'receipts', 'install-v1.json'));
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
  const tree = canonical(toplevel);
  const main = mainWorkingTree(workRoot);
  if (main === undefined || main === tree || holdsInstallReceipt(tree)) {
    return Object.freeze({ workRoot, installRoot: workRoot });
  }
  return Object.freeze({ workRoot, installRoot: main });
}
