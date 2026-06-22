// Risk-gated, sequential stacked auto-merge (autoplan RISK #1, redesigned). There
// is NO "deterministic conflict-free cascade": squash-merge rewrites the parent
// SHA, so a stacked child can conflict on rebase and GitHub won't auto-retarget.
// Instead we (1) gate which clusters may auto-merge at all (UC2), (2) treat an
// indeterminate branch protection as fatal under auto-merge (M2), and (3)
// classify the observed PR state into a safe action — merge / rebase / wait /
// block — never resolving a conflict silently. All pure; the git/gh execution is
// wrapped behind the integrate runner.

import type { ProtectionStatus } from './branch-protection.js';
import type { GitRun } from './worktree.js';

// --- UC2: which clusters may auto-merge ---

export interface AutoMergeRisk {
  readonly clusterId: string;
  /** Files changed across the cluster's integration diff. */
  readonly fileCount: number;
  readonly touchesUi: boolean;
  readonly touchesSecurity: boolean;
  readonly touchesMigration: boolean;
  /** Another cluster stacks on this one (its branch is a stack base). */
  readonly isStackRoot: boolean;
}

export interface AutoMergeGateOptions {
  /** Max files for a "small" diff; default 10. */
  readonly maxFiles?: number;
}

export interface AutoMergeDecision {
  readonly arm: boolean;
  readonly reason: string;
}

const DEFAULT_MAX_FILES = 10;

/** Arm `gh pr merge --auto` only for a low-risk, non-root cluster. */
export function autoMergeGate(
  risk: AutoMergeRisk,
  autoMerge: boolean,
  opts?: AutoMergeGateOptions,
): AutoMergeDecision {
  if (!autoMerge) return { arm: false, reason: 'auto-merge not requested' };
  if (risk.isStackRoot) return { arm: false, reason: 'stack root — a human merges the chain head' };
  if (risk.touchesSecurity) return { arm: false, reason: 'touches security — human merge' };
  if (risk.touchesMigration) return { arm: false, reason: 'touches a migration — human merge' };
  if (risk.touchesUi) return { arm: false, reason: 'touches UI — human merge' };
  const maxFiles = opts?.maxFiles ?? DEFAULT_MAX_FILES;
  if (risk.fileCount > maxFiles) {
    return { arm: false, reason: `diff too large (${risk.fileCount} > ${maxFiles} files)` };
  }
  return { arm: true, reason: 'low-risk cluster' };
}

// --- M2: branch protection under auto-merge ---

export type GateSeverity = 'ok' | 'warn' | 'fatal';

export interface ProtectionGate {
  readonly proceed: boolean;
  readonly severity: GateSeverity;
  readonly reason?: string;
}

export function protectionGate(status: ProtectionStatus, autoMerge: boolean): ProtectionGate {
  if (status.kind === 'protected') return { proceed: true, severity: 'ok' };
  if (status.kind === 'unprotected') {
    return { proceed: false, severity: 'fatal', reason: 'base branch is unprotected' };
  }
  // indeterminate: fatal under auto-merge (no human watching), a warning otherwise.
  return autoMerge
    ? { proceed: false, severity: 'fatal', reason: `branch protection indeterminate (${status.reason})` }
    : { proceed: true, severity: 'warn', reason: `branch protection indeterminate (${status.reason})` };
}

// --- M1: classify the observed merge state into a safe action ---

export interface MergeObservation {
  readonly mergeable: 'clean' | 'conflict' | 'unknown';
  readonly checks: 'pass' | 'pending' | 'fail';
  /** Is the PR branch up to date with its (possibly just-moved) base? */
  readonly baseUpToDate: boolean;
  readonly protection: 'protected' | 'unprotected' | 'unknown';
}

export type MergeAction =
  | { readonly kind: 'merge' }
  | { readonly kind: 'rebase' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'block'; readonly reason: string };

export function classifyMergeState(obs: MergeObservation, autoMerge: boolean): MergeAction {
  if (autoMerge && obs.protection !== 'protected') {
    return { kind: 'block', reason: `branch protection ${obs.protection} under auto-merge` };
  }
  if (obs.mergeable === 'conflict') return { kind: 'block', reason: 'merge conflict — human gate' };
  if (obs.checks === 'fail') return { kind: 'block', reason: 'required checks failed' };
  if (obs.checks === 'pending') return { kind: 'wait' };
  if (!obs.baseUpToDate) return { kind: 'rebase' };
  if (obs.mergeable === 'clean') return { kind: 'merge' };
  return { kind: 'wait' }; // mergeability not yet computed → re-observe
}

// --- arg builders (the git/gh execution is wrapped by the integrate runner) ---

/** Rebase the current branch onto `onto` (e.g. a merged parent's base). */
export function rebaseArgs(onto: string): string[] {
  return ['rebase', onto];
}

/** Retarget an open PR's base branch (after its stack parent merged). */
export function retargetArgs(pr: string, newBase: string): string[] {
  return ['pr', 'edit', pr, '--base', newBase];
}

export interface RebaseResult {
  readonly clean: boolean;
  readonly detail?: string;
}

/**
 * Rebase the current branch onto `onto`. On a conflict, ABORT and report unclean
 * — never leave a half-rebased tree, and never resolve the conflict silently.
 * This is the runtime proof that a stacked-squash cascade is not conflict-free:
 * the caller blocks for a human on `clean === false`.
 */
export function rebaseOnto(run: GitRun, onto: string, cwd: string): RebaseResult {
  const r = run(rebaseArgs(onto), cwd);
  if (r.ok) return { clean: true };
  run(['rebase', '--abort'], cwd);
  return { clean: false, detail: (r.stderr || r.stdout).trim() };
}
