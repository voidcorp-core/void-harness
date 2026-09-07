import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, mkdir, open, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import type { AutonomousValueManifest } from '../types.js';
import { type PilotCampaignCellRun, type PilotCampaignResult, runAutonomousValuePilot } from './campaign.js';
import { createPilotSchedule, type PilotResult } from './pilot.js';
import type { Metric } from './scorer.js';

export interface DurablePilotInput {
  readonly archiveDirectory: string;
  readonly manifest: AutonomousValueManifest;
  readonly configurationKey: string;
  readonly adapterIdentity?: string;
}

export async function runDurableAutonomousValuePilot(
  input: DurablePilotInput,
  runCell: PilotCampaignCellRun,
): Promise<PilotCampaignResult> {
  const manifest = validatedManifest(input.manifest);
  if (!/^[a-zA-Z0-9._/:-]{1,512}$/.test(input.configurationKey)) {
    throw new Error('invalid configuration identity');
  }
  if (input.adapterIdentity !== undefined && !/^[a-f0-9]{64}$/.test(input.adapterIdentity)) {
    throw new Error('invalid adapter identity');
  }
  const identity = createHash('sha256').update(JSON.stringify({
    manifest, configurationKey: input.configurationKey, adapterIdentity: input.adapterIdentity,
  })).digest('hex');
  const directory = input.archiveDirectory;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const claim = join(directory, 'launch.claim');
  try { await mkdir(claim, { mode: 0o700 }); } catch {
    throw new Error('archive already claimed or unavailable; inspect before recovery');
  }
  try {
    await bindArchive(directory, identity);
    const saved = new Map<string, PilotResult>();
    for (const execution of createPilotSchedule(manifest)) {
      const raw = await readBounded(join(directory, `${execution.executionId}.json`));
      if (raw !== undefined) saved.set(execution.executionId,
        readRecord(raw, identity, execution.executionId, input.configurationKey,
          manifest.cells[execution.cellId].startCommit));
    }
    const result = await runAutonomousValuePilot(manifest, async (cellInput) => {
      const executionId = cellInput.execution.executionId;
      const previous = saved.get(executionId);
      if (previous !== undefined) return previous;
      await atomicWrite(directory, `${executionId}.json`, { identity, executionId, state: 'admitted' });
      return normalizeResult(await runCell(cellInput), input.configurationKey, cellInput.cell.startCommit);
    }, {
      concurrency: 1, stopOnUnknown: true,
      onObservation: async ({ executionId, result }) => {
        await atomicWrite(directory, `${executionId}.json`, {
          identity, executionId, state: 'observed', result,
        });
      },
    });
    await atomicWrite(directory, 'report.json', result.report);
    return result;
  } finally { await rmdir(claim); }
}

function validatedManifest(manifest: AutonomousValueManifest): AutonomousValueManifest {
  const parsed = parseAutonomousValueManifest({ ...manifest,
    cells: Object.values(manifest.cells).sort((a, b) => a.id.localeCompare(b.id)).map((cell) => ({
      ...cell, fixture: cell.fixture.path, fixtureDigest: cell.fixture.digest,
    })),
  });
  if (!parsed.ok) throw new Error('invalid manifest identity');
  return parsed.value;
}

function record(value: unknown): value is Record<string, unknown> {
  return value instanceof Object && !Array.isArray(value);
}

function metric(value: unknown): Metric<number> | undefined {
  if (!record(value)) return undefined;
  if (value['kind'] === 'known' && typeof value['value'] === 'number'
    && Number.isFinite(value['value']) && value['value'] >= 0) {
    return { kind: 'known', value: value['value'] };
  }
  if (value['kind'] === 'unknown' && typeof value['reason'] === 'string'
    && value['reason'].trim() !== '') {
    return { kind: 'unknown', reason: 'adapter metric unavailable; private diagnostic omitted' };
  }
  return undefined;
}

function normalizeResult(value: unknown, configurationKey: string, sourceCommit: string): PilotResult {
  const invalid: PilotResult = { status: 'unknown', reason: 'invalid result identity or metrics' };
  if (!record(value)) return invalid;
  if ((value['status'] === 'unknown' || value['status'] === 'blocked')
    && typeof value['reason'] === 'string' && value['reason'].trim() !== '') {
    // Arbitrary adapter prose cannot be safely scrubbed by credential patterns.
    return { status: value['status'], reason: 'adapter result unavailable; private diagnostic omitted' };
  }
  const durationMs = metric(value['durationMs']);
  const costUsd = metric(value['costUsd']);
  if (value['status'] !== 'completed' || value['sourceCommit'] !== sourceCommit
    || value['configurationKey'] !== configurationKey || typeof value['score'] !== 'number'
    || !Number.isFinite(value['score']) || value['score'] < 0 || value['score'] > 1
    || typeof value['criticalDefect'] !== 'boolean' || typeof value['artifactDigest'] !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(value['artifactDigest'])
    || durationMs === undefined || costUsd === undefined) return invalid;
  return { status: 'completed', score: value['score'], criticalDefect: value['criticalDefect'],
    sourceCommit, configurationKey, artifactDigest: value['artifactDigest'], durationMs, costUsd };
}

function readRecord(
  raw: unknown, identity: string, executionId: string, configurationKey: string, sourceCommit: string,
): PilotResult {
  if (!record(raw) || raw['identity'] !== identity || raw['executionId'] !== executionId) {
    throw new Error('invalid archive identity');
  }
  if (raw['state'] === 'admitted') {
    return { status: 'unknown', reason: 'interrupted admission; effects uncertain, replay refused' };
  }
  if (raw['state'] !== 'observed') throw new Error('invalid archive state');
  return normalizeResult(raw['result'], configurationKey, sourceCommit);
}

async function readBounded(path: string): Promise<unknown> {
  let handle: FileHandle;
  try {
    // POSIX nonblocking open allows rejecting a FIFO before waiting for a writer.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (record(error) && error['code'] === 'ENOENT') return undefined;
    throw new Error('archive read refused');
  }
  try {
    if (!(await handle.stat()).isFile()) throw new Error('archive is not a file');
    const buffer = Buffer.alloc(8193);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 8192) throw new Error('archive exceeds record bound');
    try {
      const parsed: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      return parsed;
    } catch { throw new Error('invalid archive JSON'); }
  } finally { await handle.close(); }
}

async function bindArchive(directory: string, identity: string): Promise<void> {
  const existing = await readBounded(join(directory, 'identity.json'));
  if (existing === undefined) {
    await atomicWrite(directory, 'identity.json', { schemaVersion: 1, identity });
  } else if (!record(existing) || existing['schemaVersion'] !== 1 || existing['identity'] !== identity) {
    throw new Error('archive identity mismatch');
  }
}

async function atomicWrite(directory: string, name: string, value: object): Promise<void> {
  const temporary = join(directory, `${name}.pending`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, join(directory, name));
  const directoryHandle = await open(directory, constants.O_RDONLY);
  try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
}
