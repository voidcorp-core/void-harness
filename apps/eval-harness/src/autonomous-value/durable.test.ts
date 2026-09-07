import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import { runDurableAutonomousValuePilot } from './durable.js';
import type { PilotResult } from './pilot.js';

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

async function input() {
  return { archiveDirectory: await mkdtemp(join(tmpdir(), 'durable-pilot-')),
    manifest: manifest(), configurationKey: 'configuration-v1' };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('durable pilot archive', () => {
  it('persists 27 observations and resumes without repeating effects', async () => {
    const options = await input();
    let effects = 0;
    const adapter = async () => { effects += 1; return completed(); };
    expect((await runDurableAutonomousValuePilot(options, adapter)).report.valid).toBe(true);
    expect((await runDurableAutonomousValuePilot(options, adapter)).report.valid).toBe(true);
    expect(effects).toBe(27);
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

  it('refuses overlapping launches while the first effect is pending', async () => {
    const options = await input();
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

  it('records admission before effects and never replays an uncertain admission', async () => {
    const options = await input();
    let admission = '';
    await runDurableAutonomousValuePilot(options, async ({ execution }) => {
      admission = await readFile(join(options.archiveDirectory, `${execution.executionId}.json`), 'utf8');
      expect(JSON.parse(admission)).toMatchObject({ state: 'admitted' });
      return { status: 'unknown', reason: 'interrupted' };
    });
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

  it('stops after a failed durable observation and refuses replay on resume', async () => {
    const options = await input();
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
      { timeout: 2000 })).resolves.toMatchObject({ stdout: '', stderr: '' });
  });
});
