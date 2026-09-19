import { isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAutopilotCommand } from './autopilot.js';
import {
  observedCheckout, worktreeObservation, worktreeRequest, WORKTREE_BRANCH, WORKTREE_HOME,
  WORKTREE_NOW, WORKTREE_PATH, WORKTREE_REPO, WORKTREE_ROOT, WORKTREE_SHA,
} from '../lib/autopilot/worktree-fixtures.js';

function execute(request: Record<string, unknown>, json = true) {
  return runAutopilotCommand(['orchestrate', ...(json ? ['--json'] : [])], JSON.stringify(request), {
    root: WORKTREE_REPO, now: WORKTREE_NOW,
  });
}

function output(request: Record<string, unknown>) {
  const response = execute(request);
  expect(response).toMatchObject({ exitCode: 0, stderr: '' });
  return JSON.parse(response.stdout);
}

function refused(request: Record<string, unknown>) {
  const response = execute(request);
  expect(response.exitCode).toBe(2);
  expect(response.stdout).toBe('');
  expect(JSON.parse(response.stderr)).toMatchObject({ error: { code: 'AUTOPILOT_CONTRACT' } });
  expect(response.stderr).not.toMatch(/"command"\s*:/);
}

function withCheckout(over: Record<string, unknown> = {}) {
  return worktreeObservation({
    worktrees: [observedCheckout()],
    branches: [{ branch: `refs/heads/${WORKTREE_BRANCH}`, headSha: WORKTREE_SHA }],
    destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: true }],
    ...over,
  });
}

function cleanup(over: Record<string, unknown> = {}) {
  const prepared = output(worktreeRequest());
  return {
    schemaVersion: 2, action: 'cleanup', plan: prepared.plan,
    integration: { sha: 'a'.repeat(40), included: [{ ticketId: 'DEV-1', headSha: WORKTREE_SHA }], excludedTicketIds: [] },
    merge: { integrationSha: 'a'.repeat(40), mergeSha: 'b'.repeat(40), ticketIds: ['DEV-1'], observedAt: '2026-09-16T16:00:00.000Z' },
    worktrees: withCheckout(), retainedTicketIds: [],
    ...over,
  };
}

describe('v2 worktree observations at the real CLI boundary', () => {
  it('ignores an unused relative XDG fallback when VOID_WORKTREES is selected', () => {
    const result = output(worktreeRequest({ worktrees: worktreeObservation({
      environment: { home: WORKTREE_HOME, voidWorktrees: WORKTREE_ROOT, xdgDataHome: 'unused-relative' },
    }) }));
    expect(result.plan.worktreeRoot).toBe(WORKTREE_ROOT);
  });

  it('preserves an observed accented legacy branch without ASCII renaming', () => {
    const branch = 'travail/dépôt-évolution';
    const path = join(WORKTREE_ROOT, 'example', ...branch.split('/'));
    const result = output(worktreeRequest({
      ticketBranches: [{ ticketId: 'DEV-1', branch }],
      worktrees: worktreeObservation({
        branches: [{ branch: `refs/heads/${branch}`, headSha: WORKTREE_SHA }],
        worktrees: [observedCheckout({ branch: `refs/heads/${branch}`, path })],
        destinations: [{ path, canonicalPath: path, exists: true }],
      }),
    }));
    expect(result.setup).toEqual([]);
    expect(result.plan.assignments[0].branch).toBe(branch);
  });

  it('does not refuse unrelated Git refs differing only in case on a sensitive filesystem', () => {
    const result = output(worktreeRequest({ worktrees: worktreeObservation({
      branches: [
        { branch: 'refs/heads/main', headSha: WORKTREE_SHA },
        { branch: 'refs/heads/Other', headSha: WORKTREE_SHA },
        { branch: 'refs/heads/other', headSha: WORKTREE_SHA },
      ],
    }) }));
    expect(result.plan.assignments[0].branch).toBe(WORKTREE_BRANCH);
  });

  it.each([1, 7, '2'])('refuses legacy/unsupported schema %s without executable output', (schemaVersion) => {
    refused(worktreeRequest({ schemaVersion }));
  });

  it.each(['schemaVersion', 'action', 'worktrees', 'ticketBranches'])('refuses missing %s with migration guidance', (field) => {
    const request: Record<string, unknown> = worktreeRequest();
    delete request[field];
    refused(request);
    expect(execute(request).stderr).toMatch(/v2|version 2|schemaVersion/);
  });

  it('emits absolute branch-preserving paths and planned dispositions', () => {
    const result = output(worktreeRequest());
    expect(result).toMatchObject({ schemaVersion: 2, action: 'prepare', teardown: [] });
    expect(result.plan.assignments[0]).toMatchObject({ branch: WORKTREE_BRANCH, worktreePath: WORKTREE_PATH });
    expect(isAbsolute(result.plan.assignments[0].worktreePath)).toBe(true);
    expect(result.dispositions[0]).toMatchObject({ state: 'planned-create', ticketId: 'DEV-1', worktreePath: WORKTREE_PATH });
    expect(execute(worktreeRequest(), false).stdout).toContain(WORKTREE_PATH);
    expect(execute(worktreeRequest(), false).stdout).toMatch(/planned|not executed/);
  });

  it.each([
    [{ home: WORKTREE_HOME, voidWorktrees: resolve('/durable/custom') }, resolve('/durable/custom')],
    [{ home: WORKTREE_HOME, xdgDataHome: resolve('/durable/data') }, resolve('/durable/data/git-worktrees')],
    [{ home: WORKTREE_HOME, voidWorktrees: '', xdgDataHome: '' }, WORKTREE_ROOT],
  ])('applies explicit override and empty-as-unset precedence', (environment, root) => {
    const path = join(root, 'example', ...WORKTREE_BRANCH.split('/'));
    const result = output(worktreeRequest({ worktrees: worktreeObservation({
      environment, destinations: [{ path, canonicalPath: path, exists: false }],
    }) }));
    expect(result.plan.assignments[0].worktreePath).toBe(path);
  });

  it.each(['relative/root', join(WORKTREE_REPO, 'ignored'), resolve('/tmp/checkouts')])('rejects unsafe explicit root %s', (root) => {
    refused(worktreeRequest({ worktrees: worktreeObservation({ environment: { home: WORKTREE_HOME, voidWorktrees: root } }) }));
  });

  it('rejects a durable-looking destination physically resolving inside the repository', () => {
    refused(worktreeRequest({ worktrees: worktreeObservation({ destinations: [{
      path: WORKTREE_PATH, canonicalPath: join(WORKTREE_REPO, 'alias'), exists: false,
    }] }) }));
  });

  it('reuses a registered branch without setup commands, including dirty work', () => {
    const result = output(worktreeRequest({ worktrees: withCheckout({ worktrees: [observedCheckout({ dirty: true })] }) }));
    expect(result.setup).toEqual([]);
    expect(result.dispositions[0]).toMatchObject({ state: 'reuse', worktreePath: WORKTREE_PATH });
  });

  it('moves a bound legacy dirty branch across clusters without recreating it', () => {
    const branch = 'autopilot-worker/legacy/DEV-1';
    const path = join(WORKTREE_ROOT, 'example', ...branch.split('/'));
    const old = join(WORKTREE_REPO, '.void/autopilot/old/worktrees/DEV-1');
    const result = output(worktreeRequest({
      clusterId: 'later-cluster', ticketBranches: [{ ticketId: 'DEV-1', branch }],
      worktrees: worktreeObservation({
        worktrees: [observedCheckout({ branch: `refs/heads/${branch}`, path: old, dirty: true })],
        branches: [{ branch: `refs/heads/${branch}`, headSha: WORKTREE_SHA }],
        destinations: [{ path, canonicalPath: path, exists: false }],
      }),
    }));
    expect(result.plan.assignments[0]).toMatchObject({ branch, worktreePath: path });
    expect(result.setup).toHaveLength(2);
    expect(result.setup[0].command.slice(0, 2)).toEqual(['node', '-e']);
    expect(result.setup[0].command[3]).toBe(join(WORKTREE_ROOT, 'example', 'autopilot-worker', 'legacy'));
    expect(result.setup[1].command).toEqual(['git', 'worktree', 'move', old, path]);
  });

  it.each(['locked', 'main', 'hasSubmodules'])('refuses a %s migration without fallback', (flag) => {
    refused(worktreeRequest({ worktrees: withCheckout({
      worktrees: [observedCheckout({ path: resolve('/legacy/work'), [flag]: true })],
      destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: false }],
    }) }));
  });

  it('refuses an occupied target belonging to no registered branch', () => {
    refused(worktreeRequest({ worktrees: worktreeObservation({
      destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: true }],
    }) }));
  });

  it('adds an existing branch without -b or resetting its tip', () => {
    const result = output(worktreeRequest({ worktrees: worktreeObservation({
      branches: [
        { branch: 'refs/heads/main', headSha: WORKTREE_SHA },
        { branch: `refs/heads/${WORKTREE_BRANCH}`, headSha: WORKTREE_SHA },
      ],
    }) }));
    expect(result.setup[0].command).toEqual(['git', 'worktree', 'add', WORKTREE_PATH, WORKTREE_BRANCH]);
  });

  it('plans only prune and re-observation for a disappeared registration', () => {
    const result = output(worktreeRequest({ worktrees: withCheckout({
      worktrees: [observedCheckout({ exists: false })],
      destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: false }],
    }) }));
    expect(result.setup.map((step: { command: string[] }) => step.command)).toEqual([['git', 'worktree', 'prune']]);
    expect(result.dispositions[0].state).toBe('reobserve-after-prune');
  });

  it('refuses competing ticket mappings and duplicate registered branch claims', () => {
    refused(worktreeRequest({ ticketBranches: [
      { ticketId: 'DEV-1', branch: WORKTREE_BRANCH }, { ticketId: 'DEV-1', branch: 'legacy/other' },
    ] }));
    refused(worktreeRequest({ worktrees: withCheckout({ worktrees: [observedCheckout(), observedCheckout({ path: resolve('/other') })] }) }));
  });
});

describe('fresh post-merge cleanup planning', () => {
  it('retains useful ignored local data even when Git reports a clean checkout', () => {
    const result = output(cleanup({ worktrees: withCheckout({
      worktrees: [observedCheckout({ dirty: false, localData: 'preserve' })],
    }) }));
    expect(result.teardown).toEqual([]);
    expect(result.dispositions[0]).toMatchObject({ state: 'retained' });
    expect(result.dispositions[0].reason).toMatch(/local data|ignored|evidence/);
  });

  it('removes only an evidenced clean owned checkout after a later human merge', () => {
    const result = output(cleanup());
    expect(result.setup).toEqual([]);
    expect(result.teardown[0].command).toEqual(['git', 'worktree', 'remove', WORKTREE_PATH]);
    expect(result.dispositions[0].state).toBe('planned-remove');
  });

  it('retains dirty work without changing the observed merge outcome', () => {
    const result = output(cleanup({ worktrees: withCheckout({ worktrees: [observedCheckout({ dirty: true })] }) }));
    expect(result.teardown).toEqual([]);
    expect(result.dispositions[0]).toMatchObject({ state: 'retained' });
    expect(result.dispositions[0].reason).toMatch(/dirty/);
    expect(result.dispositions[0].nextAction).toMatch(/inventory|observe/);
  });

  it('is an idempotent no-op after an earlier cleanup removed the checkout', () => {
    const result = output(cleanup({ worktrees: worktreeObservation() }));
    expect(result.teardown).toEqual([]);
    expect(result.dispositions[0].state).toBe('already-absent');
  });

  it.each([
    { integrationSha: 'c'.repeat(40) },
    { ticketIds: ['FOREIGN-1'] },
    { observedAt: '2026-09-16T17:00:00.000Z' },
  ])('refuses mismatched merge evidence without executable steps', (over) => {
    const request = cleanup();
    refused({ ...request, merge: { ...request.merge, ...over } });
  });

  it('retains explicit holds and refuses a stale inventory', () => {
    expect(output(cleanup({ retainedTicketIds: ['DEV-1'] })).teardown).toEqual([]);
    refused(cleanup({ worktrees: withCheckout({ observedAt: '2026-09-16T15:00:00.000Z' }) }));
  });
});

// Post-review corrections: real planner boundaries, not staged workflow results.
function twoOwnedCleanup() {
  const branch = 'autopilot-worker/DEV-2';
  const path = join(WORKTREE_ROOT, 'example', ...branch.split('/'));
  const observation = withCheckout({
    worktrees: [observedCheckout(), observedCheckout({ branch: `refs/heads/${branch}`, path })],
    branches: [{ branch: `refs/heads/${WORKTREE_BRANCH}`, headSha: WORKTREE_SHA }, { branch: `refs/heads/${branch}`, headSha: WORKTREE_SHA }],
    destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: true }, { path, canonicalPath: path, exists: true }],
  });
  const prepared = output(worktreeRequest({
    tickets: ['DEV-1', 'DEV-2'], clusterSize: 2,
    footprints: [{ id: 'DEV-1', areas: ['src/a'], highRisk: false, confidence: 1, touchesMigration: false },
      { id: 'DEV-2', areas: ['src/b'], highRisk: false, confidence: 1, touchesMigration: false }],
    ticketBranches: [{ ticketId: 'DEV-1', branch: WORKTREE_BRANCH }, { ticketId: 'DEV-2', branch }], worktrees: observation,
  }));
  return cleanup({ plan: prepared.plan, worktrees: observation,
    integration: { sha: 'a'.repeat(40), included: [{ ticketId: 'DEV-1', headSha: WORKTREE_SHA }], excludedTicketIds: ['DEV-2'] } });
}

describe('post-review cleanup and preparation corrections', () => {
  it('preserves the original prepare inputs needed to reconfirm scheduling', () => {
    const request = worktreeRequest({ sequentialOwnership: ['src/a'], minConfidence: 0.7 });
    expect(output(request).prepareInput).toEqual(request);
  });

  it.each([false, true])('renders executable cleanup argv as planned, including prune=%s', (missing) => {
    const request = cleanup({ worktrees: withCheckout({
      worktrees: [observedCheckout({ exists: !missing })],
      destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: !missing }],
    }) });
    const response = execute(request, false);
    expect(response.exitCode).toBe(0);
    expect(response.stdout).toContain(JSON.stringify(missing ? ['git', 'worktree', 'prune'] : ['git', 'worktree', 'remove', WORKTREE_PATH]));
    expect(response.stdout).toMatch(/planned.*not executed/i);
  });

  it.each(['schema', 'evidence'])('gives actionable cleanup recovery for %s refusal without rejected fields', (kind) => {
    const request = cleanup();
    const response = execute(kind === 'schema' ? { ...request, retainedTicketIds: 'bad' }
      : { ...request, merge: { ...request.merge, integrationSha: 'c'.repeat(40) } });
    expect(response.exitCode).toBe(2);
    expect(response.stdout).toBe('');
    const fix = JSON.parse(response.stderr).error.fix;
    expect(fix).not.toContain('ticketBranches');
    for (const field of ['plan', 'integration', 'merge', 'worktrees', 'retainedTicketIds']) expect(fix).toContain(field);
    expect(output(request).teardown).toHaveLength(1);
    refused({ ...request, ticketBranches: [{ ticketId: 'DEV-1', branch: WORKTREE_BRANCH }] });
  });

  it('removes only included checkout while retaining an excluded owned checkout', () => {
    const result = output(twoOwnedCleanup());
    expect(result.teardown.map((step: { command: string[] }) => step.command)).toEqual([['git', 'worktree', 'remove', WORKTREE_PATH]]);
    expect(result.dispositions).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: 'DEV-1', state: 'planned-remove' }),
      expect.objectContaining({ ticketId: 'DEV-2', state: 'retained' }),
    ]));
  });

  it.each(['DEV-1', 'DEV-2'])('refuses when owned %s is absent from included and excluded sets', (omitted) => {
    const request = twoOwnedCleanup();
    // Keep one included item so this reaches set validation, not min-array schema validation.
    const included = omitted === 'DEV-1' ? 'DEV-2' : 'DEV-1';
    refused({ ...request, integration: { sha: 'a'.repeat(40), included: [{ ticketId: included, headSha: WORKTREE_SHA }], excludedTicketIds: [] },
      merge: { ...request.merge, ticketIds: [included] } });
  });

  it.each(['prepare', 'cleanup'])('does not globally prune foreign missing registration during %s', (action) => {
    const foreign = observedCheckout({ path: resolve('/durable/foreign'), branch: 'refs/heads/foreign', exists: false, localData: 'preserve' });
    const observation = withCheckout({ worktrees: [observedCheckout({ exists: false }), foreign],
      branches: [{ branch: `refs/heads/${WORKTREE_BRANCH}`, headSha: WORKTREE_SHA }, { branch: 'refs/heads/foreign', headSha: WORKTREE_SHA }],
      destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: false }] });
    const result = output(action === 'prepare' ? worktreeRequest({ worktrees: observation }) : cleanup({ worktrees: observation }));
    expect(result.setup).toEqual([]);
    expect(result.teardown).toEqual([]);
    expect(result.dispositions[0]).toMatchObject({ state: 'retained' });
  });

  it.each([
    { dirty: true }, { localData: 'preserve' },
  ])('preserves recoverable metadata of an owned missing checkout: %j', (over) => {
    const observation = withCheckout({ worktrees: [observedCheckout({ exists: false, ...over })],
      destinations: [{ path: WORKTREE_PATH, canonicalPath: WORKTREE_PATH, exists: false }] });
    for (const request of [worktreeRequest({ worktrees: observation }), cleanup({ worktrees: observation })]) {
      const result = output(request);
      expect(result.setup).toEqual([]);
      expect(result.teardown).toEqual([]);
      expect(result.dispositions[0].state).toBe('retained');
    }
  });

  it.each(['excluded', 'held'])('does not prune another missing %s owned checkout', (kind) => {
    const request = twoOwnedCleanup();
    const worktrees = request.worktrees;
    const missing = { ...worktrees, worktrees: worktrees.worktrees.map((entry) => ({ ...entry, exists: false })),
      destinations: worktrees.destinations.map((entry) => ({ ...entry, exists: false })) };
    const result = output({ ...request, worktrees: missing,
      ...(kind === 'held' ? { retainedTicketIds: ['DEV-2'], integration: { sha: 'a'.repeat(40),
        included: [{ ticketId: 'DEV-1', headSha: WORKTREE_SHA }, { ticketId: 'DEV-2', headSha: WORKTREE_SHA }], excludedTicketIds: [] },
        merge: { ...request.merge, ticketIds: ['DEV-1', 'DEV-2'] } } : {}),
    });
    expect(result.teardown).toEqual([]);
    expect(result.dispositions.every((entry: { state: string }) => entry.state === 'retained')).toBe(true);
  });
});
