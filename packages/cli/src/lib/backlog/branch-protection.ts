// Server-side branch protection is the durable A1 boundary (the remote refuses
// non-PR pushes regardless of what the worker executes). The orchestrator
// confirms it at preflight; this module is the pure decision over `gh api`
// output. The wiring (spawning gh, resolving owner/repo) lives in the command.
//
// Parse is STRICT so a confirmed-unprotected base is refused; an indeterminate
// result (no auth, gh missing, network) degrades to a warning, never a pass.

import type { RunResult } from './run.js';

/** Outcome of probing `gh api repos/{owner}/{repo}/branches/<base>/protection`. */
export type ProtectionStatus =
  | { readonly kind: 'protected' }
  | { readonly kind: 'unprotected' }
  | { readonly kind: 'unknown'; readonly reason: string };

/** GitHub's exact 404 body/message when a branch exists but has no protection. */
const NOT_PROTECTED = /branch not protected/i;

function looksUnprotected(text: string): boolean {
  return NOT_PROTECTED.test(text);
}

/** Decide protection status from a finished `gh api` call (pure, strict). */
export function evaluateBranchProtection(result: RunResult): ProtectionStatus {
  if (result.ok) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch {
      return { kind: 'unknown', reason: 'gh returned a non-JSON protection body' };
    }
    if (parsed === null || typeof parsed !== 'object') {
      return { kind: 'unknown', reason: 'gh returned an empty protection body' };
    }
    const message = (parsed as { message?: unknown }).message;
    if (typeof message === 'string' && looksUnprotected(message)) {
      return { kind: 'unprotected' };
    }
    return { kind: 'protected' };
  }

  const signal = `${result.stderr}\n${result.stdout}`;
  if (looksUnprotected(signal)) return { kind: 'unprotected' };

  const reason = signal.trim().split('\n').find((l) => l.trim() !== '')?.trim() ?? 'gh api failed';
  return { kind: 'unknown', reason };
}

/**
 * Resolve the default branch name from `git symbolic-ref refs/remotes/origin/HEAD`
 * output ("origin/main\n" → "main"). Undefined when there is no `origin/` prefix
 * (no remote HEAD resolved); the caller then falls back to a sensible default.
 */
export function baseBranchFromSymbolicRef(out: string): string | undefined {
  const trimmed = out.trim();
  const prefix = 'origin/';
  if (!trimmed.startsWith(prefix)) return undefined;
  const name = trimmed.slice(prefix.length).trim();
  return name === '' ? undefined : name;
}
