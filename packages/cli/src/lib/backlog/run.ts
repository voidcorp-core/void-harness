// The slice of a finished child process (git / gh / a stub) that the backlog
// orchestration reasons about. Shared so integrate, worktree, and
// branch-protection name one shape once, not three synonyms (anti-bloat).

export interface RunResult {
  /** Process exit code was 0. */
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}
