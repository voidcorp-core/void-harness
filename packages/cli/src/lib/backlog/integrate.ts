// Ticket integration: the TRUSTED orchestrator pushes the worker's branch and
// opens the PR. Issue #17 cluster A (A1): the worker is commit-only — `git push`
// and `gh pr` are removed from its allowlist, so it physically cannot write to
// the remote. The capability lives here instead, behind an explicit, non-force
// refspec. Pure builders + an injected-runner orchestration keep it testable.

import type { RunResult } from './run.js';
import type { BacklogEvent } from './stream.js';

/** A PR title + body the worker reported (via a `.pr.md` file in its worktree). */
export interface PrSpec {
  readonly title: string;
  readonly body: string;
}

/** Injected command runner so the orchestration is testable without spawning. */
export type IntegrateRun = (cmd: string, args: readonly string[], cwd: string) => RunResult;

/** Explicit, non-force refspec push for a single branch (never a bare push). */
export function pushArgs(branch: string): string[] {
  return ['push', 'origin', `${branch}:refs/heads/${branch}`];
}

/**
 * `gh pr create` args with an explicit base + head. Uses the worker's reported
 * title/body when present, else `--fill` (GitHub draws the body from commits).
 */
export function prCreateArgs(base: string, head: string, spec: PrSpec | undefined): string[] {
  const head_ = ['pr', 'create', '--base', base, '--head', head];
  if (spec === undefined) return [...head_, '--fill'];
  return [...head_, '--title', spec.title, '--body', spec.body];
}

/**
 * Request GitHub auto-merge (squash) for a branch's PR. `--auto` arms the merge
 * for when required checks pass; it does not poll or merge a red PR. The remote
 * still enforces branch protection, so this cannot bypass required reviews.
 */
export function mergeArgs(branch: string): string[] {
  return ['pr', 'merge', branch, '--squash', '--auto'];
}

/** First non-empty line = PR title; the remainder (trimmed) = PR body. */
export function parsePrFile(content: string): PrSpec {
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i] ?? '').trim() === '') i++;
  const title = (lines[i] ?? '').trim();
  const body = lines.slice(i + 1).join('\n').trim();
  return { title, body };
}

/**
 * True when the PR body carries an unchecked `source-debt` checkbox (A3): config
 * authored offline without the version-matched docs, not yet verified by a human.
 * The loop refuses to arm auto-merge in that state — see source-driven-development.
 */
export function hasUnresolvedSourceDebt(prBody: string): boolean {
  return /-\s*\[\s\]\s*source-debt/i.test(prBody);
}

/** The last branch the worker reported, or the fallback if it reported none. */
export function branchFromEvents(events: readonly BacklogEvent[], fallback: string): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.kind === 'branch') return event.name;
  }
  return fallback;
}

export interface IntegrateOptions {
  readonly branch: string;
  readonly base: string;
  /** Directory the branch lives in (the run root, or the ticket worktree). */
  readonly cwd: string;
  readonly prSpec?: PrSpec;
  /** Arm GitHub auto-merge for the PR (HITL escape hatch; remote still gates). */
  readonly autoMerge?: boolean;
  readonly run: IntegrateRun;
}

export interface IntegrateOutcome {
  readonly pushed: boolean;
  readonly prRef?: string;
  readonly autoMergeRequested?: boolean;
  readonly error?: string;
}

/**
 * Push the worker's branch, then open its PR (and optionally arm auto-merge).
 * The push comes first: a failed push (e.g. the remote's branch protection
 * rejecting it) must NOT leave a PR dangling, so `gh` is never invoked unless
 * the push succeeded.
 */
export function integrateTicket(opts: IntegrateOptions): IntegrateOutcome {
  const pushed = opts.run('git', pushArgs(opts.branch), opts.cwd);
  if (!pushed.ok) {
    return { pushed: false, error: (pushed.stderr || pushed.stdout).trim() };
  }
  const pr = opts.run('gh', prCreateArgs(opts.base, opts.branch, opts.prSpec), opts.cwd);
  if (!pr.ok) {
    return { pushed: true, error: (pr.stderr || pr.stdout).trim() };
  }
  const prRef = pr.stdout.trim().split('\n').filter((l) => l.trim() !== '').pop();
  // gh prints the PR url to stdout on success; if it exits 0 with none, surface
  // it rather than silently reporting a PR with no reference to review.
  if (prRef === undefined || prRef === '') {
    return { pushed: true, error: 'gh pr create succeeded but returned no PR URL' };
  }
  const base: IntegrateOutcome = { pushed: true, prRef };

  if (opts.autoMerge !== true) return base;
  // A3: an open source-debt blocks auto-merge — the config was authored offline
  // and must be verified against the version-matched docs by a human first.
  if (opts.prSpec !== undefined && hasUnresolvedSourceDebt(opts.prSpec.body)) {
    return { ...base, error: 'auto-merge withheld: unresolved source-debt in the PR body' };
  }
  const merge = opts.run('gh', mergeArgs(opts.branch), opts.cwd);
  return merge.ok
    ? { ...base, autoMergeRequested: true }
    : { ...base, autoMergeRequested: false, error: (merge.stderr || merge.stdout).trim() };
}
