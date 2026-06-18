// Per-ticket git worktree isolation (issue #17 cluster A, A2). Each iteration
// runs in its own detached worktree so the worker's `git switch -c <branch>`
// never moves the main checkout's HEAD, and concurrent/sequential iterations
// cannot collide. Branches the worker commits live in the SHARED object store,
// so they survive `worktree remove` and the orchestrator can push them.
//
// `--detach` is deliberate: a non-detached `worktree add` would create a leaked
// temp branch. `push.default current` is set INSIDE the worktree and governs
// only a *bare* `git push` (the orchestrator uses an explicit refspec, which
// ignores it) — it is a narrow safety net, not the boundary.

import { join } from 'node:path';

/** One spawned git command's result (the slice this module needs). */
export interface RunResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injected git runner so the lifecycle is testable with real or fake git. */
export type GitRun = (args: readonly string[], cwd: string) => RunResult;

/** Run-scoped parent dir for this run's worktrees (gitignored under .void/). */
export function worktreeRoot(repoRoot: string, sha: string, pid: number): string {
  return join(repoRoot, '.void', 'worktrees', `${sha}-${pid}`);
}

/** Per-iteration worktree path under the run-scoped parent. */
export function iterationWorktree(root: string, iteration: number): string {
  return join(root, `i-${iteration}`);
}

export const PRUNE_ARGS: readonly string[] = ['worktree', 'prune'];

/** Remove records for worktrees whose directories vanished (crash recovery). */
export function pruneWorktrees(run: GitRun, repoRoot: string): void {
  run(PRUNE_ARGS, repoRoot);
}

/**
 * Add a fresh detached worktree at `path` and set `push.default current` in it.
 * Throws with a clear message if the worktree could not be created (a half-made
 * run must fail loud, not silently fall back to the main checkout).
 */
export function addWorktree(run: GitRun, repoRoot: string, path: string): void {
  const added = run(['worktree', 'add', '--detach', path], repoRoot);
  if (!added.ok) {
    throw new Error(`git worktree add failed for ${path}: ${(added.stderr || added.stdout).trim()}`);
  }
  run(['config', 'push.default', 'current'], path);
}

/** Remove a worktree (force: drop even with untracked/modified files in it). */
export function removeWorktree(run: GitRun, repoRoot: string, path: string): void {
  run(['worktree', 'remove', '--force', path], repoRoot);
}
