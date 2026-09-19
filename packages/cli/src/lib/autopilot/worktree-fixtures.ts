// Test observations are explicit so the planner never borrows the runner's home or Git state.
import { join, resolve } from 'node:path';
import type { ObservedWorktree, WorktreeObservation } from './worktree-contract.js';

export const WORKTREE_SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
export const WORKTREE_NOW = '2026-09-16T16:01:00.000Z';
export const WORKTREE_HOME = resolve('/users/worktree-test');
export const WORKTREE_REPO = resolve('/projects/example');
export const WORKTREE_ROOT = join(WORKTREE_HOME, '.local/share/git-worktrees');
export const WORKTREE_BRANCH = 'autopilot-worker/DEV-1';
export const WORKTREE_PATH = join(WORKTREE_ROOT, 'example', ...WORKTREE_BRANCH.split('/'));

export function observedCheckout(over: Record<string, unknown> = {}): ObservedWorktree {
  return {
    path: WORKTREE_PATH, branch: `refs/heads/${WORKTREE_BRANCH}`, headSha: WORKTREE_SHA,
    exists: true, main: false, locked: false, hasSubmodules: false, dirty: false, localData: 'none',
    ...over,
  };
}

export function worktreeObservation(over: Record<string, unknown> = {}): WorktreeObservation {
  return {
    repository: { name: 'example', root: WORKTREE_REPO },
    environment: { home: WORKTREE_HOME },
    observedAt: WORKTREE_NOW, caseSensitive: true,
    worktrees: [observedCheckout({ path: WORKTREE_REPO, branch: 'refs/heads/main', main: true })],
    branches: [{ branch: 'refs/heads/main', headSha: WORKTREE_SHA }],
    destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: false }],
    temporaryRoots: [resolve('/tmp'), resolve('/private/tmp')],
    ...over,
  };
}

export function worktreeRequest(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2, action: 'prepare', runId: 'run-a', clusterId: 'cluster-a',
    base: { branch: 'main', sha: WORKTREE_SHA }, tickets: ['DEV-1'],
    footprints: [{ id: 'DEV-1', areas: ['src/a'], confidence: 1, highRisk: false, touchesMigration: false }],
    clusterSize: 1, planPath: 'docs/plans/p.md', specPath: 'docs/specs/s.md',
    ticketBranches: [{ ticketId: 'DEV-1', branch: WORKTREE_BRANCH }],
    worktrees: worktreeObservation(),
    ...over,
  };
}
