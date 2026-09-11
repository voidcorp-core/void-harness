import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import { setupSandbox } from '../sandbox.js';
import { parsePilotApproval } from './approval.js';
import { createConsumerCellWorkspaceFactory } from './consumer-workspace.js';
import { createPilotSchedule } from './pilot.js';
import { createConformanceCellExecutor } from './runner.js';
import { type BoundedRuntimeAdapter, type RuntimePilotInput, runDurableRuntimePilot } from './runtime-pilot.js';

async function scenario(runtime: 'codex' | 'claude' = 'codex') {
  const source = setupSandbox({ 'result.txt': 'before\n' });
  const fixture = { 'task.txt': 'Produce the requested result.\n' };
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(Object.entries(fixture).sort(([a], [b]) => a.localeCompare(b)))).digest('hex')}`;
  const parsed = parseAutonomousValueManifest({
    schemaVersion: 1, campaignId: 'runtime-pilot-test',
    comparability: { runtime, model: 'model', modelVersion: '1', effort: 'low',
      resourceProfile: 'isolated', orderSeed: 'seed', humanIntervention: 'none' },
    cells: ['implement', 'autopilot', 'brainstorm'].flatMap((path) =>
      ['agent-alone', 'implement', 'autopilot'].map((condition) => ({
        id: `${path}-${condition}`, path, condition, startCommit: source.baseSha,
        objective: path, defectOracle: ['proof'], fixture: `autonomous-value/${path}`,
        fixtureDigest: digest,
      }))),
  });
  if (!parsed.ok) throw new Error('invalid test manifest');
  const authorityRoot = await realpath(await mkdtemp(join(tmpdir(), 'runtime-pilot-test-')));
  const approval = parsePilotApproval({ schemaVersion: 1, campaignId: parsed.value.campaignId,
    approvedBy: 'Local fixture, not spending consent', approvedAt: '2026-09-08T00:00:00.000Z',
    runtime, model: 'model', modelVersion: '1', effort: 'low',
    resourceProfile: 'isolated', humanIntervention: 'none',
    artifactDigest: `sha256:${'c'.repeat(64)}`, maxExecutions: 27, budgetUsd: 27,
    confidence: 0.95, minDetectableEffect: 0.1, qualityReview: 'blind-human',
  }, parsed.value);
  if (!approval.ok) throw new Error('invalid test approval');
  const approvalDigest = `sha256:${createHash('sha256').update(JSON.stringify(approval.value)).digest('hex')}`;
  const archiveDirectory = join(authorityRoot, approvalDigest.slice(7));
  const input: RuntimePilotInput = {
    archiveDirectory, manifest: parsed.value, configurationKey: 'configuration-v1',
    reviewerKey: 'test-oracle-v1',
    budget: { authorityRoot, approval: approval.value,
      provenance: { kind: 'verified', approvalDigest }, policyKey: 'test-only-no-paid-process',
      reservations: createPilotSchedule(parsed.value).map(({ executionId }) => ({ executionId, maxCostUsd: 1 })) },
    artifactDigest: `sha256:${'c'.repeat(64)}`,
    workspaceFactory: createConsumerCellWorkspaceFactory({ sourceCheckout: source.dir }),
    loadTask: () => ({ fixture, task: 'Change result.txt', skillBody: 'Use targeted verification.' }),
    assess: async () => ({ kind: 'reviewed', score: 0.75, quality: {
      criticalDefect: false, falseGreen: false, inventedProof: false,
      correctionCycles: 0, correctionResolved: true,
    } }),
  };
  const workspaces: string[] = [];
  const executor = createConformanceCellExecutor(async ({ cwd, args }) => {
    expect(args).toContain('--json');
    expect(args).toContain('model_reasoning_effort="low"');
    workspaces.push(cwd);
    writeFileSync(join(cwd, 'result.txt'), 'after\n');
    return { outcome: { kind: 'exited', code: 0 }, stdout: '', stderr: '' };
  });
  const adapter: BoundedRuntimeAdapter = { kind: 'bounded', runtime, model: 'model',
    modelVersion: '1', effort: 'low', proofDigest: `sha256:${'e'.repeat(64)}`,
    coverage: 'all-in-flight-and-descendants', execute: async (request) => {
      expect(request.maxCostMicroUsd).toBe(1000000);
      const record = JSON.parse(readFileSync(join(archiveDirectory, `${request.executionId}.json`), 'utf8'));
      expect(record).toMatchObject({ state: 'admitted', reservationMicroUsd: request.maxCostMicroUsd });
      return executor(request);
    } };
  return { input, adapter, workspaces, source };
}

describe('durable runtime composition', () => {
  it('runs the real workspace and seal path, then reuses results without processes or admissions', async () => {
    const { input, adapter, workspaces, source } = await scenario();
    let reviews = 0;
    const options = { ...input,
      assess: async (request: Parameters<RuntimePilotInput['assess']>[0]) => {
        reviews += 1;
        expect(request.evidence.cleanup.kind).toBe('complete');
        expect(request.evidence.diff).toContain('+after');
        expect(workspaces.every((path) => !existsSync(path))).toBe(true);
        return input.assess(request);
      },
    };
    const result = await runDurableRuntimePilot(options, adapter);
    expect(result.report.valid).toBe(true);
    expect(result.observations[0]?.result).toMatchObject({ status: 'completed', score: 0.75,
      costUsd: { kind: 'unknown' } });
    expect((await runDurableRuntimePilot({ ...options, archiveDirectory: join(input.archiveDirectory, 'export') }, adapter)).report.valid).toBe(true);
    expect([workspaces.length, reviews]).toEqual([27, 27]);
    expect(readFileSync(join(source.dir, 'result.txt'), 'utf8')).toBe('before\n');
  }, 30_000);

  it.each(['codex', 'claude'] as const)('refuses production %s without creating workspaces or reservations', async (runtime) => {
    const { input, workspaces } = await scenario(runtime);
    const result = await runDurableRuntimePilot({ ...input,
      workspaceFactory: { create: () => { throw new Error('must not create'); } } });
    expect(result.observations[0]?.result?.status).toBe('blocked');
    expect(workspaces).toHaveLength(0);
    expect(existsSync(input.archiveDirectory)).toBe(false);
  });

  it('binds getter-backed capability proof and accepts equivalent reordered metadata', async () => {
    const { input, adapter, workspaces } = await scenario();
    const options = { ...input, assess: async () => ({ kind: 'unavailable' as const }) };
    let proofDigest = adapter.proofDigest;
    class GetterAdapter implements BoundedRuntimeAdapter {
      get kind() { return adapter.kind; }
      get runtime() { return adapter.runtime; }
      get model() { return adapter.model; }
      get modelVersion() { return adapter.modelVersion; }
      get effort() { return adapter.effort; }
      get coverage() { return adapter.coverage; }
      get proofDigest() { return proofDigest; }
      get execute() { return adapter.execute; }
    }
    await runDurableRuntimePilot(options, new GetterAdapter());
    proofDigest = `sha256:${'f'.repeat(64)}`;
    await expect(runDurableRuntimePilot(options, new GetterAdapter())).rejects.toThrow('identity');
    const reordered: BoundedRuntimeAdapter = { execute: adapter.execute, proofDigest: adapter.proofDigest,
      coverage: adapter.coverage, effort: adapter.effort, modelVersion: adapter.modelVersion,
      model: adapter.model, runtime: adapter.runtime, kind: adapter.kind };
    await runDurableRuntimePilot(options, reordered);
    expect(workspaces).toHaveLength(1);
  });

  it('rejects oversized reservation arrays before reading any entry', async () => {
    const { input, adapter, workspaces } = await scenario();
    if (input.budget === undefined) throw new Error('missing fixture budget');
    let read = false;
    const reservations = Array.from({ length: 28 }, () => ({
      get executionId() { read = true; return 'invalid'; }, maxCostUsd: 1,
    }));
    await expect(runDurableRuntimePilot({ ...input, budget: { ...input.budget, reservations } }, adapter))
      .rejects.toThrow('reservation');
    expect(read).toBe(false);
    expect(workspaces).toHaveLength(0);
    expect(existsSync(input.archiveDirectory)).toBe(false);
  });

  it.each([{ artifactDigest: 'unverified' }, { reviewerKey: '' },
    { reviewerKey: 'x'.repeat(513) }])('refuses invalid runtime identity %j before loading tasks', async (change) => {
    const { input, adapter, workspaces } = await scenario();
    let loaded = false;
    await expect(runDurableRuntimePilot({ ...input, ...change, loadTask: (request) => {
      loaded = true; return input.loadTask(request);
    } }, adapter)).rejects.toThrow('invalid runtime adapter identity');
    expect(loaded).toBe(false);
    expect(workspaces).toHaveLength(0);
    expect(existsSync(input.archiveDirectory)).toBe(false);
  });

  it('refuses duplicate reservations before loading tasks or creating authority', async () => {
    const { input, adapter, workspaces } = await scenario();
    if (input.budget === undefined) throw new Error('missing fixture budget');
    const first = input.budget.reservations[0];
    if (first === undefined) throw new Error('missing fixture reservation');
    let loaded = false;
    await expect(runDurableRuntimePilot({ ...input,
      budget: { ...input.budget, reservations: input.budget.reservations.map(() => first) },
      loadTask: (request) => { loaded = true; return input.loadTask(request); },
    }, adapter)).rejects.toThrow('invalid runtime reservation plan');
    expect(loaded).toBe(false);
    expect(workspaces).toHaveLength(0);
    expect(existsSync(input.archiveDirectory)).toBe(false);
  });

  it('blocks missing condition skills without executing those cells or refunding their reservations', async () => {
    const { input, adapter, workspaces } = await scenario();
    const options = { ...input, loadTask: (request: Parameters<RuntimePilotInput['loadTask']>[0]) => ({
      ...input.loadTask(request), skillBody: undefined,
    }) };
    const result = await runDurableRuntimePilot(options, adapter);
    expect(result.report.valid).toBe(false);
    const schedule = createPilotSchedule(input.manifest);
    const stoppedAt = schedule.findIndex((execution) => input.manifest.cells[execution.cellId].condition !== 'agent-alone');
    expect(stoppedAt).toBe(3);
    expect(result.observations).toHaveLength(27);
    expect(result.observations.slice(stoppedAt + 1).every((observation) => observation.result?.status === 'unknown')).toBe(true);
    for (const execution of schedule.slice(0, stoppedAt + 1)) {
      const record: unknown = JSON.parse(readFileSync(join(input.archiveDirectory, `${execution.executionId}.json`), 'utf8'));
      expect(record).toMatchObject({ state: 'observed', reservationMicroUsd: 1000000,
        result: { status: input.manifest.cells[execution.cellId].condition === 'agent-alone' ? 'completed' : 'blocked' } });
    }
    for (const execution of schedule.slice(stoppedAt + 1)) {
      expect(existsSync(join(input.archiveDirectory, `${execution.executionId}.json`))).toBe(false);
    }
    await runDurableRuntimePilot(options, adapter);
    expect(workspaces).toHaveLength(stoppedAt);
  });

  it('refuses absent or incompatible authority before reserving or executing', async () => {
    const { input, adapter, workspaces } = await scenario();
    if (input.budget === undefined) throw new Error('missing fixture budget');
    const approval = parsePilotApproval(input.budget.approval, input.manifest);
    if (!approval.ok) throw new Error('missing fixture approval');
    for (const change of [
      { budget: undefined },
      { budget: { ...input.budget, provenance: { kind: 'unavailable' as const } } },
      { budget: { ...input.budget, approval: undefined } },
      { budget: { ...input.budget, approval: { ...approval.value, maxExecutions: 1 } } },
    ]) {
      const result = await runDurableRuntimePilot({ ...input, ...change }, adapter);
      expect(result.observations[0]?.result?.status).toBe('blocked');
    }
    for (const change of [{ model: 'wrong' }, { modelVersion: 'wrong' }, { effort: 'wrong' },
      { runtime: 'claude' as const }, { proofDigest: 'unverified' }]) {
      const result = await runDurableRuntimePilot(input, { ...adapter, ...change });
      expect(result.observations[0]?.result?.status).toBe('blocked');
    }
    expect(workspaces).toHaveLength(0);
    expect(existsSync(input.archiveDirectory)).toBe(false);
  });

  it('never scores an unavailable or failing assessor and never repeats that execution', async () => {
    for (const kind of ['unavailable', 'throws', 'false-green', 'invalid-score']) {
      const { input, adapter, workspaces } = await scenario();
      const options: RuntimePilotInput = { ...input, assess: async (request) => {
        if (kind === 'throws') throw new Error('private-review-text');
        if (kind === 'unavailable') return { kind: 'unavailable' };
        const review = await input.assess(request);
        if (review.kind !== 'reviewed') return review;
        return kind === 'invalid-score' ? { ...review, score: Number.NaN }
          : { ...review, quality: { ...review.quality, falseGreen: true } };
      } };
      const result = await runDurableRuntimePilot(options, adapter);
      expect(result.report.valid).toBe(false);
      expect(result.observations[0]?.result?.status).not.toBe('completed');
      await runDurableRuntimePilot(options, adapter);
      expect(workspaces).toHaveLength(1);
      expect(workspaces.every((path) => !existsSync(path))).toBe(true);
      expect(readFileSync(join(input.archiveDirectory, 'report.json'), 'utf8')).not.toContain('private-review-text');
    }
  });

  it('does not call an assessor after a failed process', async () => {
    const { input, adapter } = await scenario();
    let assessed = false;
    const executor = createConformanceCellExecutor(async () => ({
      outcome: { kind: 'timed-out' }, stdout: '', stderr: '',
    }));
    const result = await runDurableRuntimePilot({ ...input, assess: async () => {
      assessed = true; return { kind: 'unavailable' };
    } }, { ...adapter, execute: executor });
    expect(assessed).toBe(false);
    expect(result.report.valid).toBe(false);
  });

  it('refuses changed artifact, admission policy or reviewer on resume', async () => {
    const { input, adapter, workspaces } = await scenario();
    await runDurableRuntimePilot(input, adapter);
    if (input.budget === undefined) throw new Error('missing fixture budget');
    for (const change of [
      { artifactDigest: `sha256:${'d'.repeat(64)}` },
      { budget: { ...input.budget, policyKey: 'changed-policy' } }, { reviewerKey: 'changed-reviewer' },
      { loadTask: (request: Parameters<RuntimePilotInput['loadTask']>[0]) => ({
        ...input.loadTask(request), task: 'Different task',
      }) },
    ]) {
      await expect(runDurableRuntimePilot({ ...input, ...change }, adapter)).rejects.toThrow('identity');
    }
    expect(workspaces).toHaveLength(27);
  });
});
