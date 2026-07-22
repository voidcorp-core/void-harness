// Shared prerequisite checks for the harness install. `doctor` and `init` both
// need to know whether jq (required by every enforcement hook), gh (required to
// reach the public marketplace), and the marketplace repo itself are usable.
// Extracted here so the two commands can never drift in what "healthy" means
// (audit 2026-07-09, issue #67).

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * gh gates the marketplace fetch. Two distinct failures the caller must
 * be able to tell apart: not installed vs installed-but-unauthenticated.
 */
export function checkGh(): CheckResult {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    return {
      name: 'gh CLI',
      ok: false,
      message: 'gh CLI not installed (required for marketplace pin resolution)',
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
      message: 'gh CLI not authenticated (required for marketplace pin resolution)',
      fix: 'gh auth login',
    };
  }
}

/**
 * The marketplace repo must be reachable AND readable with the current gh auth.
 * This is the check that catches "authenticated to GitHub, but no access to the
 * repo" — a distinct failure from an unauthenticated gh, surfaced at
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

/**
 * The local hooks only enforce the floor on THIS machine; a cloud agent or a
 * --dangerously-skip-permissions bypass slips past them. The void-enforce Action
 * replays the same floor server-side on every PR. This is ADVISORY (ok stays
 * true so it never blocks doctor): it just tells a project whether it has
 * adopted the server-side floor, and how to if not (DEV-393).
 */
export function checkEnforceWorkflow(root: string): CheckResult {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) {
    return { name: 'enforce Action', ok: true, message: 'no .github/workflows (server-side floor not applicable)' };
  }
  // Never throw out of an advisory check: an unreadable entry (a dir named *.yml,
  // a broken symlink, a TOCTOU removal) must degrade to a note, not crash doctor
  // and discard every other diagnostic already collected.
  let adopted = false;
  try {
    adopted = readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .some((f) => {
        try {
          const text = readFileSync(join(dir, f), 'utf8');
          // Either the reusable workflow (consumers) or the composite action (local).
          return text.includes('void-harness/.github/workflows/enforce.yml') || text.includes('actions/void-enforce');
        } catch {
          return false;
        }
      });
  } catch (err) {
    return { name: 'enforce Action', ok: true, message: `could not inspect .github/workflows (${(err as Error).message})` };
  }
  if (adopted) {
    return { name: 'enforce Action', ok: true, message: 'void-enforce workflow adopted (server-side floor)' };
  }
  return {
    name: 'enforce Action',
    ok: true,
    message: 'server-side floor not adopted — local hooks only',
    fix: 'add .github/workflows/void-enforce.yml (uses: voidcorp-core/void-harness/.github/workflows/enforce.yml@main) — see README',
  };
}
