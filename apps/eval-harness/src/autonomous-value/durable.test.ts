import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import { parsePilotApproval } from './approval.js';
import { runDurableAutonomousValuePilot } from './durable.js';
import { createPilotSchedule, type PilotResult } from './pilot.js';

function manifest() {
  const parsed = parseAutonomousValueManifest({
    schemaVersion: 1, campaignId: 'durable-test',
    comparability: { runtime: 'fake', model: 'model', modelVersion: '1', effort: 'low',
      resourceProfile: 'isolated', orderSeed: 'seed', humanIntervention: 'none' },
    cells: ['implement', 'autopilot', 'brainstorm'].flatMap((path) =>
      ['agent-alone', 'implement', 'autopilot'].map((condition) => ({
        id: `${path}-${condition}`, path, condition, startCommit: 'a'.repeat(40),
        objective: path, defectOracle: ['proof'], fixture: `autonomous-value/${path}`,
        fixtureDigest: `sha256:${'b'.repeat(64)}`,
      }))),
  });
  if (!parsed.ok) throw new Error('invalid fixture');
  return parsed.value;
}

function completed(): PilotResult {
  return { status: 'completed', score: 1, criticalDefect: false,
    sourceCommit: 'a'.repeat(40), artifactDigest: `sha256:${'c'.repeat(64)}`,
    configurationKey: 'configuration-v1', durationMs: { kind: 'known', value: 1 },
    costUsd: { kind: 'known', value: 0 } };
}

async function input(budgeted = false, budgetUsd = 27) {
  const campaign = manifest();
  const root = await realpath(await mkdtemp(join(tmpdir(), 'durable-pilot-')));
  const approvalInput = { schemaVersion: 1, campaignId: campaign.campaignId,
    approvedBy: 'Local test fixture, not spending consent', approvedAt: '2026-09-08T00:00:00.000Z',
    runtime: campaign.comparability.runtime, model: 'model', modelVersion: '1', effort: 'low',
    resourceProfile: 'isolated', humanIntervention: 'none', artifactDigest: `sha256:${'c'.repeat(64)}`,
    maxExecutions: 27, budgetUsd, confidence: 0.95, minDetectableEffect: 0.1, qualityReview: 'blind-human' };
  const approved = parsePilotApproval(approvalInput, campaign);
  if (!approved.ok) throw new Error('invalid approval fixture');
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(approved.value)).digest('hex')}`;
  const budget = budgeted ? { authorityRoot: root, approval: approved.value,
    provenance: { kind: 'verified' as const, approvalDigest: digest }, policyKey: 'budget-v1',
    reservations: createPilotSchedule(campaign).map(({ executionId }) => ({ executionId, maxCostUsd: 1 })) } : undefined;
  return { archiveDirectory: budgeted ? join(root, digest.slice(7)) : root,
    manifest: campaign, configurationKey: 'configuration-v1', budget };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('durable pilot archive', () => {
  it.each([false, true])('persists 27 observations and resumes without repeating effects (budget=%s)', async (budgeted) => {
    const options = await input(budgeted);
    let effects = 0;
    const adapter = async () => { effects += 1; return completed(); };
    expect((await runDurableAutonomousValuePilot(options, adapter)).report.valid).toBe(true);
    expect((await runDurableAutonomousValuePilot(options, adapter)).report.valid).toBe(true);
    expect(effects).toBe(27);
    if (budgeted) {
      for (const { executionId } of createPilotSchedule(options.manifest)) {
        expect(JSON.parse(await readFile(join(options.archiveDirectory, `${executionId}.json`), 'utf8')))
          .toMatchObject({ reservationMicroUsd: 1000000 });
      }
      await runDurableAutonomousValuePilot({ ...options, archiveDirectory: join(options.archiveDirectory, 'other-export') }, adapter);
      expect(effects).toBe(27);
    }
  });

  it('refuses changed manifest or configuration before any new effect', async () => {
    const options = await input();
    await runDurableAutonomousValuePilot(options, async () => completed());
    const forbidden = async () => { throw new Error('must not execute'); };
    await expect(runDurableAutonomousValuePilot({ ...options,
      configurationKey: 'changed' }, forbidden)).rejects.toThrow('identity');
    await expect(runDurableAutonomousValuePilot({ ...options,
      manifest: { ...options.manifest, campaignId: 'changed' } }, forbidden))
      .rejects.toThrow('identity');
  });

  it.each([
    { configurationKey: '' }, { configurationKey: 'x'.repeat(513) },
    { adapterIdentity: 'unverified' },
  ])('refuses invalid archive identity %j before creating authority', async (change) => {
    const options = await input(true);
    if (options.budget === undefined) throw new Error('missing budget fixture');
    let effects = 0;
    await expect(runDurableAutonomousValuePilot({ ...options, ...change }, async () => {
      effects += 1; return completed();
    })).rejects.toThrow('identity');
    expect(effects).toBe(0);
    expect(await readdir(options.budget.authorityRoot)).toEqual([]);
  });

  it.each(['approval', 'policy', 'reservations'] as const)(
    'refuses invalid budget %s before creating authority', async (kind) => {
      const options = await input(true);
      if (options.budget === undefined) throw new Error('missing budget fixture');
      const budget = { ...options.budget,
        approval: kind === 'approval' ? {} : options.budget.approval,
        policyKey: kind === 'policy' ? '' : options.budget.policyKey,
        reservations: kind === 'reservations' ? [] : options.budget.reservations };
      let effects = 0;
      await expect(runDurableAutonomousValuePilot({ ...options, budget }, async () => {
        effects += 1; return completed();
      })).rejects.toThrow('invalid budget');
      expect(effects).toBe(0);
      expect(await readdir(budget.authorityRoot)).toEqual([]);
    });

  it.each([
    { durationMs: false }, { costUsd: { kind: 'known', value: -1 } },
    { costUsd: { kind: 'known', value: '0' } },
    { costUsd: { kind: 'unknown', reason: '' } },
    { costUsd: { kind: 'unknown', reason: '   ' } },
  ])('never scores or replays a recovered result with invalid metrics %j', async (change) => {
    const options = await input(true, 1);
    await runDurableAutonomousValuePilot(options, async () => completed());
    const path = join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json');
    const saved: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!(saved instanceof Object) || Array.isArray(saved)) throw new Error('missing record fixture');
    await writeFile(path, JSON.stringify({ ...saved, result: { ...completed(), ...change } }));
    let effects = 0;
    const resumed = await runDurableAutonomousValuePilot(options, async () => {
      effects += 1; return completed();
    });
    expect(resumed.report.valid).toBe(false);
    expect(resumed.observations[0]?.result).toMatchObject({ status: 'unknown' });
    expect(effects).toBe(0);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ reservationMicroUsd: 1000000 });
  });

  it('rejects an unrecognized archive state without erasing its reservation', async () => {
    const options = await input(true, 1);
    await runDurableAutonomousValuePilot(options, async () => completed());
    const path = join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json');
    const saved: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!(saved instanceof Object) || Array.isArray(saved)) throw new Error('missing record fixture');
    const corrupted = JSON.stringify({ ...saved, state: 'refunded' });
    await writeFile(path, corrupted);
    let effects = 0;
    await expect(runDurableAutonomousValuePilot(options, async () => {
      effects += 1; return completed();
    })).rejects.toThrow('invalid archive state');
    expect(effects).toBe(0);
    expect(await readFile(path, 'utf8')).toBe(corrupted);
  });

  it.each([false, true])('refuses overlapping launches while the first effect is pending (budget=%s)', async (budgeted) => {
    const options = await input(budgeted);
    const admitted = deferred();
    const release = deferred();
    const running = runDurableAutonomousValuePilot(options, async () => {
      admitted.resolve(); await release.promise; return completed();
    });
    await admitted.promise;
    await expect(runDurableAutonomousValuePilot(options, async () => completed()))
      .rejects.toThrow('claimed');
    release.resolve();
    expect((await running).report.valid).toBe(true);
  });

  it.each([false, true])('records admission before effects and never replays an uncertain admission (budget=%s)', async (budgeted) => {
    const options = await input(budgeted);
    let admission = '';
    await runDurableAutonomousValuePilot(options, async ({ execution }) => {
      admission = await readFile(join(options.archiveDirectory, `${execution.executionId}.json`), 'utf8');
      expect(JSON.parse(admission)).toMatchObject({ state: 'admitted' });
      if (budgeted) expect(JSON.parse(admission)).toMatchObject({ reservationMicroUsd: 1000000 });
      return { status: 'unknown', reason: 'interrupted' };
    });
    expect(JSON.parse(admission)).toMatchObject({ state: 'admitted' });
    if (budgeted) expect(JSON.parse(admission)).toMatchObject({ reservationMicroUsd: 1000000 });
    await writeFile(join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json'), admission);
    let effects = 0;
    const resumed = await runDurableAutonomousValuePilot(options, async () => {
      effects += 1; return completed();
    });
    expect(effects).toBe(0);
    expect(resumed.report.entries[0]?.result).toMatchObject({ status: 'unknown' });
    expect(resumed.report.valid).toBe(false);
  });

  it('rejects malformed archives and stale completed identities', async () => {
    const options = await input();
    const report = await runDurableAutonomousValuePilot(options, async () => ({
      ...completed(), configurationKey: 'wrong',
    }));
    expect(report.report.unknownCount).toBe(27);
    await writeFile(join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json'), '{}');
    await expect(runDurableAutonomousValuePilot(options, async () => completed()))
      .rejects.toThrow('archive');
  });

  it('bounds and redacts diagnostic text before persisting it', async () => {
    const options = await input();
    await runDurableAutonomousValuePilot(options, async () => ({
      status: 'unknown', reason: `Bearer sensitive-value ${'x'.repeat(2000)}`,
    }));
    const record = await readFile(join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json'), 'utf8');
    expect(record).not.toContain('sensitive-value');
    expect(record.length).toBeLessThan(1500);
  });

  it('refuses oversized and symlinked records before admitting effects', async () => {
    for (const kind of ['oversized', 'symlink']) {
      const options = await input();
      const path = join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json');
      if (kind === 'oversized') await writeFile(path, 'x'.repeat(8193));
      else await symlink(join(options.archiveDirectory, 'identity.json'), path);
      let effects = 0;
      await expect(runDurableAutonomousValuePilot(options, async () => {
        effects += 1; return completed();
      })).rejects.toThrow('archive');
      expect(effects).toBe(0);
    }
  });

  it.each([false, true])('stops after a failed durable observation and refuses replay on resume (budget=%s)', async (budgeted) => {
    const options = await input(budgeted);
    let effects = 0;
    const adapter = async ({ execution }: { execution: { executionId: string } }) => {
      effects += 1;
      await mkdir(join(options.archiveDirectory, `${execution.executionId}.json.pending`));
      return completed();
    };
    await expect(runDurableAutonomousValuePilot(options, adapter)).rejects.toThrow();
    expect(effects).toBe(1);
    await expect(runDurableAutonomousValuePilot(options, adapter)).rejects.toThrow();
    expect(effects).toBe(1);
  });

  it('stops at the exact budget and never refunds cheaper or unknown outcomes', async () => {
    for (const costUsd of [{ kind: 'known' as const, value: 0 }, { kind: 'unknown' as const, reason: 'unavailable' }]) {
      const options = await input(true, 1);
      let effects = 0;
      const adapter = async () => { effects += 1; return { ...completed(), costUsd }; };
      const result = await runDurableAutonomousValuePilot(options, adapter);
      expect(result.report.valid).toBe(false);
      expect(result.observations[1]?.result?.status).toBe('blocked');
      await runDurableAutonomousValuePilot(options, adapter);
      expect(effects).toBe(1);
    }
  });

  it('refuses changed policy, legacy reservations, corrupted amounts and unverified provenance', async () => {
    for (const kind of ['policy', 'legacy', 'amount', 'provenance', 'unknown-refund', 'cap']) {
      const options = await input(true);
      if (options.budget === undefined) throw new Error('missing budget fixture');
      await runDurableAutonomousValuePilot(options, async () => completed());
      const path = join(options.archiveDirectory, 'autopilot-agent-alone-pilot-1.json');
      const saved = JSON.parse(await readFile(path, 'utf8'));
      if (kind === 'legacy') { delete saved.reservationMicroUsd; await writeFile(path, JSON.stringify(saved)); }
      if (kind === 'amount') { saved.reservationMicroUsd = -1; await writeFile(path, JSON.stringify(saved)); }
      if (kind === 'unknown-refund') {
        saved.reservationMicroUsd = 0;
        saved.result = { status: 'unknown', reason: 'interrupted' };
        await writeFile(path, JSON.stringify(saved));
      }
      const budget = { ...options.budget,
        reservations: options.budget.reservations.map((entry, index) =>
          kind === 'cap' && index === 0 ? { ...entry, maxCostUsd: 2 } : entry),
        policyKey: kind === 'policy' ? 'changed' : options.budget.policyKey,
        provenance: { ...options.budget.provenance,
          approvalDigest: kind === 'provenance' ? `sha256:${'0'.repeat(64)}` : options.budget.provenance.approvalDigest } };
      let effects = 0;
      await expect(runDurableAutonomousValuePilot({ ...options, budget }, async () => {
        effects += 1; return completed();
      })).rejects.toThrow();
      expect(effects).toBe(0);
      expect(await readdir(budget.authorityRoot)).toEqual([options.budget.provenance.approvalDigest.slice(7)]);
    }
  });

  it('refuses an excessive recovered total even when each reservation equals its cap', async () => {
    const options = await input(true, 1);
    if (options.budget === undefined) throw new Error('missing fixture budget');
    await runDurableAutonomousValuePilot(options, async () => completed());
    const [first, second] = createPilotSchedule(options.manifest);
    if (first === undefined || second === undefined) throw new Error('missing fixture execution');
    const saved = JSON.parse(await readFile(join(options.archiveDirectory, `${first.executionId}.json`), 'utf8'));
    await writeFile(join(options.archiveDirectory, `${second.executionId}.json`),
      JSON.stringify({ ...saved, executionId: second.executionId }));
    let effects = 0;
    await expect(runDurableAutonomousValuePilot(options, async () => {
      effects += 1; return completed();
    })).rejects.toThrow('reservations exceed budget');
    expect(effects).toBe(0);
    expect(await readdir(options.budget.authorityRoot)).toEqual([options.budget.provenance.approvalDigest.slice(7)]);
  });

  it.each(['file', 'directory'] as const)('retains an uncertain admission after its %s sync fails', async (failAt) => {
    const options = await input(true);
    let effects = 0;
    let writes = 0;
    const adapter = async () => { effects += 1; return completed(); };
    const storage = { sync: async (handle: import('node:fs/promises').FileHandle, target: string) => {
      if (target === failAt && ++writes === 2) throw new Error('admission sync failed');
      await handle.sync();
    } };
    if (failAt === 'file') {
      await expect(runDurableAutonomousValuePilot(options, adapter, storage)).rejects.toThrow();
      await expect(runDurableAutonomousValuePilot(options, adapter)).rejects.toThrow();
    } else {
      const interrupted = await runDurableAutonomousValuePilot(options, adapter, storage);
      expect(interrupted.report.valid).toBe(false);
      await runDurableAutonomousValuePilot(options, adapter);
    }
    expect(effects).toBe(0);
  });

  it('refuses effects when root or record synchronization fails, including root reopening', async () => {
    for (const failAt of ['authority-root', 'file', 'directory'] as const) {
      const options = await input(true);
      let effects = 0;
      let syncs = 0;
      const adapter = async () => { effects += 1; return completed(); };
      await expect(runDurableAutonomousValuePilot(options, adapter, {
        sync: async (handle, target) => {
          syncs += 1;
          if (target === failAt) throw new Error('injected sync failure');
          await handle.sync();
        },
      })).rejects.toThrow();
      expect(syncs).toBeGreaterThan(0);
      expect(effects).toBe(0);
      if (failAt === 'authority-root') {
        await expect(runDurableAutonomousValuePilot(options, adapter, {
          sync: async () => { throw new Error('root reopen sync failure'); },
        })).rejects.toThrow();
        expect(effects).toBe(0);
      }
    }
  });

  it('does not echo invalid JSON archive contents in diagnostic errors', async () => {
    const options = await input();
    await writeFile(join(options.archiveDirectory, 'identity.json'), 'private archive contents');
    await expect(runDurableAutonomousValuePilot(options, async () => completed()))
      .rejects.toThrow('invalid archive JSON');
  });

  it('omits quoted and unstructured private diagnostics from cell and report archives', async () => {
    for (const diagnostic of ['{"token":"private-token","password":"private-password"}',
      'customer private-address@example.test']) {
      const options = await input();
      await runDurableAutonomousValuePilot(options, async () => ({ status: 'unknown', reason: diagnostic }));
      for (const file of ['autopilot-agent-alone-pilot-1.json', 'report.json']) {
        expect(await readFile(join(options.archiveDirectory, file), 'utf8')).not.toContain('private-');
      }
    }
  });

  it('refuses a POSIX FIFO archive without waiting for a writer', async () => {
    const options = await input();
    await promisify(execFile)('mkfifo', [join(options.archiveDirectory, 'identity.json')], { timeout: 1000 });
    const script = `
      import { runDurableAutonomousValuePilot } from './src/autonomous-value/durable.ts';
      try {
        await runDurableAutonomousValuePilot(JSON.parse(process.argv[1]), async () => {
          throw new Error('unexpected effect');
        });
        process.exitCode = 1;
      } catch (error) {
        if (error.message !== 'archive is not a file') process.exitCode = 1;
      }
    `;
    await expect(promisify(execFile)(process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script, JSON.stringify(options)],
      { cwd: resolve(import.meta.dirname, '../..'), timeout: 2000 }))
      .resolves.toMatchObject({ stdout: '', stderr: '' });
  });
});
