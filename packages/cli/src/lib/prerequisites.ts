// Shared prerequisite checks for the harness install. `doctor` and `init` both
// need to know whether jq (required by every enforcement hook), gh (required to
// reach the private marketplace), and the marketplace repo itself are usable.
// Extracted here so the two commands can never drift in what "healthy" means
// (audit 2026-07-09, issue #67).

import { execSync } from 'node:child_process';
import { fetchRemoteMarketplace } from './remote.js';

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly message: string;
  readonly fix?: string;
}

/**
 * jq is parsed from stdin by every PreToolUse hook (tdd-guard, no-any,
 * boundary-direction-check, ...). Without it those hooks now fail CLOSED (#63),
 * but a consumer still needs to know their machine cannot run enforcement.
 */
export function checkJq(): CheckResult {
  try {
    execSync('jq --version', { stdio: 'ignore' });
    return { name: 'jq', ok: true, message: 'available (required by hooks)' };
  } catch {
    return {
      name: 'jq',
      ok: false,
      message: 'jq not installed: enforcement hooks cannot run',
      fix: 'brew install jq OR https://jqlang.github.io/jq/download/',
    };
  }
}

/**
 * gh gates the private-marketplace fetch. Two distinct failures the caller must
 * be able to tell apart: not installed vs installed-but-unauthenticated.
 */
export function checkGh(): CheckResult {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    return {
      name: 'gh CLI',
      ok: false,
      message: 'gh CLI not installed (required for private marketplace)',
      fix: 'brew install gh OR https://cli.github.com',
    };
  }
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return { name: 'gh CLI', ok: true, message: 'authenticated' };
  } catch {
    return {
      name: 'gh CLI',
      ok: false,
      message: 'gh CLI not authenticated (required for private marketplace)',
      fix: 'gh auth login',
    };
  }
}

/**
 * The marketplace repo must be reachable AND readable with the current gh auth.
 * This is the check that catches "authenticated to GitHub, but no access to the
 * private repo" — a distinct failure from an unauthenticated gh, surfaced at
 * init time instead of only after a restart when the plugin never loads.
 */
export function checkMarketplaceAccess(repo: string): CheckResult {
  const remote = fetchRemoteMarketplace(repo);
  if (remote.ok) {
    return { name: 'marketplace', ok: true, message: `${repo} reachable` };
  }
  return {
    name: 'marketplace',
    ok: false,
    message: `cannot read ${repo}: ${remote.error}`,
    fix: `verify access to ${repo} (gh auth login / request repo access), then void-harness update`,
  };
}
