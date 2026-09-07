import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import { setupSandbox } from '../sandbox.js';
import { createConsumerCellWorkspaceFactory } from './consumer-workspace.js';
import { createConformanceCellExecutor } from './runner.js';
import { type RuntimePilotInput, runDurableRuntimePilot } from './runtime-pilot.js';

async function scenario() {
  const source = setupSandbox({ 'result.txt': 'before\n' });
  const fixture = { 'task.txt': 'Produce the requested result.\n' };
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(Object.entries(fixture).sort(([a], [b]) => a.localeCompare(b)))).digest('hex')}`;
  const parsed = parseAutonomousValueManifest({
    schemaVersion: 1, campaignId: 'runtime-pilot-test',
    comparability: { runtime: 'codex', model: 'model', modelVersion: '1', effort: 'low',
      resourceProfile: 'isolated', orderSeed: 'seed', humanIntervention: 'none' },
    cells: ['implement', 'autopilot', 'brainstorm'].flatMap((path) =>
      ['agent-alone', 'implement', 'autopilot'].map((condition) => ({
        id: `${path}-${condition}`, path, condition, startCommit: source.baseSha,
        objective: path, defectOracle: ['proof'], fixture: `autonomous-value/${path}`,
        fixtureDigest: digest,
      }))),
  });
  if (!parsed.ok) throw new Error('invalid test manifest');
  const archiveDirectory = await mkdtemp(join(tmpdir(), 'runtime-pilot-test-'));
  const input: RuntimePilotInput = {
    archiveDirectory, manifest: parsed.value, configurationKey: 'configuration-v1',
    admissionPolicyKey: 'test-only-no-paid-process', reviewerKey: 'test-oracle-v1',
    artifactDigest: `sha256:${'c'.repeat(64)}`,
    workspaceFactory: createConsumerCellWorkspaceFactory({ sourceCheckout: source.dir }),
    loadTask: () => ({ fixture, task: 'Change result.txt', skillBody: 'Use targeted verification.' }),
    admit: async ({ execution }) => ({ kind: 'admitted', executionId: execution.executionId,
      configurationKey: 'configuration-v1' }),
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
  return { input, executor, workspaces, source };
}

describe('durable runtime composition', () => {
  it('runs the real workspace and seal path, then reuses results without processes or admissions', async () => {
    const { input, executor, workspaces, source } = await scenario();
    let admissions = 0;
    let reviews = 0;
    const options = { ...input,
      admit: async (request: Parameters<NonNullable<RuntimePilotInput['admit']>>[0]) => {
        admissions += 1;
        const record = readFileSync(join(input.archiveDirectory, `${request.execution.executionId}.json`), 'utf8');
        expect(JSON.parse(record)).toMatchObject({ state: 'admitted' });
        if (input.admit === undefined) throw new Error('test admission missing');
        return input.admit(request);
      },
      assess: async (request: Parameters<RuntimePilotInput['assess']>[0]) => {
        reviews += 1;
        expect(request.evidence.cleanup.kind).toBe('complete');
        expect(request.evidence.diff).toContain('+after');
        expect(workspaces.every((path) => !existsSync(path))).toBe(true);
        return input.assess(request);
      },
    };
    const result = await runDurableRuntimePilot(options, executor);
    expect(result.report.valid).toBe(true);
    expect(result.observations[0]?.result).toMatchObject({ status: 'completed', score: 0.75,
      costUsd: { kind: 'unknown' } });
    expect((await runDurableRuntimePilot(options, executor)).report.valid).toBe(true);
    expect([workspaces.length, admissions, reviews]).toEqual([27, 27, 27]);
    expect(readFileSync(join(source.dir, 'result.txt'), 'utf8')).toBe('before\n');
  });

  it('refuses absent, rejected, or mismatched admission before workspace creation', async () => {
    for (const kind of ['absent', 'refused', 'mismatch']) {
      const { input, executor, workspaces } = await scenario();
      const admit: RuntimePilotInput['admit'] = kind === 'absent' ? undefined
        : async () => kind === 'refused' ? { kind: 'refused' }
          : { kind: 'admitted', executionId: 'wrong', configurationKey: input.configurationKey };
      const result = await runDurableRuntimePilot({ ...input, admit,
        workspaceFactory: { create: () => { throw new Error('must not create'); } } }, executor);
      expect(result.observations[0]?.result?.status).toBe('blocked');
      expect(workspaces).toHaveLength(0);
    }
  });

  it('never scores an unavailable or failing assessor and never repeats that execution', async () => {
    for (const kind of ['unavailable', 'throws', 'false-green', 'invalid-score']) {
      const { input, executor, workspaces } = await scenario();
      const options: RuntimePilotInput = { ...input, assess: async (request) => {
        if (kind === 'throws') throw new Error('private-review-text');
        if (kind === 'unavailable') return { kind: 'unavailable' };
        const review = await input.assess(request);
        if (review.kind !== 'reviewed') return review;
        return kind === 'invalid-score' ? { ...review, score: Number.NaN }
          : { ...review, quality: { ...review.quality, falseGreen: true } };
      } };
      const result = await runDurableRuntimePilot(options, executor);
      expect(result.report.valid).toBe(false);
      expect(result.observations[0]?.result?.status).not.toBe('completed');
      await runDurableRuntimePilot(options, executor);
      expect(workspaces).toHaveLength(1);
      expect(workspaces.every((path) => !existsSync(path))).toBe(true);
      expect(readFileSync(join(input.archiveDirectory, 'report.json'), 'utf8')).not.toContain('private-review-text');
    }
  });

  it('does not call an assessor after a failed process', async () => {
    const { input } = await scenario();
    let assessed = false;
    const executor = createConformanceCellExecutor(async () => ({
      outcome: { kind: 'timed-out' }, stdout: '', stderr: '',
    }));
    const result = await runDurableRuntimePilot({ ...input, assess: async () => {
      assessed = true; return { kind: 'unavailable' };
    } }, executor);
    expect(assessed).toBe(false);
    expect(result.report.valid).toBe(false);
  });

  it('refuses changed artifact, admission policy or reviewer on resume', async () => {
    const { input, executor, workspaces } = await scenario();
    await runDurableRuntimePilot({ ...input, admit: undefined }, executor);
    for (const change of [
      { artifactDigest: `sha256:${'d'.repeat(64)}` },
      { admissionPolicyKey: 'changed-policy' }, { reviewerKey: 'changed-reviewer' },
      { loadTask: (request: Parameters<RuntimePilotInput['loadTask']>[0]) => ({
        ...input.loadTask(request), task: 'Different task',
      }) },
    ]) {
      await expect(runDurableRuntimePilot({ ...input, ...change }, executor)).rejects.toThrow('identity');
    }
    expect(workspaces).toHaveLength(0);
  });
});
