import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CleanupEvidence } from './evidence.js';
import { type DeterministicPreflightInput, runDeterministicPreflight } from './preflight.js';
import type { CellWorkspace } from './runner.js';

const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;
const FIXTURE = { 'target.txt': 'before\n' };
const fixtureDigest = `sha256:${createHash('sha256').update(JSON.stringify(Object.entries(FIXTURE))).digest('hex')}`;

function workspace(overrides: Partial<CellWorkspace> = {}): CellWorkspace {
  return {
    dir: '/tmp/preflight',
    baseSha: SHA,
    diff: () => 'diff --git a/target.txt b/target.txt\n',
    cleanup: (): CleanupEvidence => ({ kind: 'complete', attempts: 1 }),
    ...overrides,
  };
}

function input(overrides: Partial<DeterministicPreflightInput> = {}): DeterministicPreflightInput {
  return {
    sourceCheckout: '/tmp/source',
    expectedStartCommit: SHA,
    artifactTarballPath: '/tmp/voidharness.tgz',
    expectedArtifactDigest: DIGEST,
    fixture: FIXTURE,
    fixtureDigest,
    targetPath: 'target.txt',
    targetBefore: 'before\n',
    targetAfter: 'after\n',
    workspaceFactory: { create: () => workspace() },
    writeTarget: () => undefined,
    readArtifactDigest: () => DIGEST,
    readSourceCommit: () => SHA,
    ...overrides,
  };
}

describe('deterministic preflight', () => {
  it('fails before creating a workspace when the artifact digest diverges', async () => {
    let created = false;
    const result = await runDeterministicPreflight(input({
      expectedArtifactDigest: `sha256:${'c'.repeat(64)}`,
      workspaceFactory: { create: () => { created = true; return workspace(); } },
    }));

    expect(result).toEqual({ status: 'failed', step: 'artifact', reason: 'artifact digest mismatch' });
    expect(created).toBe(false);
  });

  it('fails before creating a workspace when the source commit diverges', async () => {
    let created = false;
    const result = await runDeterministicPreflight(input({
      sourceCheckout: '/tmp/stale-source',
      readSourceCommit: () => 'c'.repeat(40),
      workspaceFactory: { create: () => { created = true; return workspace(); } },
    }));

    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.step).toBe('source');
    expect(created).toBe(false);
  });

  it('fails fast on an empty controlled diff and still cleans the workspace', async () => {
    let cleanupCalls = 0;
    const result = await runDeterministicPreflight(input({
      workspaceFactory: { create: () => workspace({
        diff: () => '',
        cleanup: () => { cleanupCalls += 1; return { kind: 'complete', attempts: 1 }; },
      }) },
    }));

    expect(result).toEqual({ status: 'failed', step: 'delivery', reason: 'controlled diff is empty', cleanup: { kind: 'complete', attempts: 1 } });
    expect(cleanupCalls).toBe(1);
  });

  it('writes the controlled target, captures delivery, and cleans up', async () => {
    let observed = '';
    const result = await runDeterministicPreflight(input({
      writeTarget: () => { observed = 'diff --git a/target.txt b/target.txt\n'; },
      workspaceFactory: { create: () => workspace({
        diff: () => observed,
      }) },
    }));

    expect(result.status).toBe('passed');
    if (result.status === 'passed') expect(result.diffBytes).toBeGreaterThan(0);
  });

  it('does not invoke a runtime executor', async () => {
    let controlledWriteCalled = false;
    const result = await runDeterministicPreflight(input({
      workspaceFactory: { create: () => workspace() },
      writeTarget: () => { controlledWriteCalled = true; },
    }));

    expect(result.status).toBe('passed');
    expect(controlledWriteCalled).toBe(true);
  });
});
