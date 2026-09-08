import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, lstat, mkdir, open, realpath, rename, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import type { AutonomousValueManifest } from '../types.js';
import { parsePilotApproval } from './approval.js';
import { type BudgetPlan, parseBudgetPlan, reserveBudget } from './budget.js';
import { type PilotCampaignCellRun, type PilotCampaignResult, runAutonomousValuePilot } from './campaign.js';
import { createPilotSchedule, type PilotResult } from './pilot.js';
import type { Metric } from './scorer.js';

export interface DurablePilotInput {
  readonly archiveDirectory: string;
  readonly manifest: AutonomousValueManifest;
  readonly configurationKey: string;
  readonly adapterIdentity?: string;
  readonly budget?: BudgetAuthorityInput | undefined;
}

export interface BudgetAuthorityInput {
  readonly authorityRoot: string;
  readonly approval: unknown;
  readonly provenance: { readonly kind: 'unavailable' }
    | { readonly kind: 'verified'; readonly approvalDigest: string };
  readonly policyKey: string;
  readonly reservations: readonly { readonly executionId: string; readonly maxCostUsd: number }[];
}

interface PreparedBudget {
  readonly approvalDigest: string;
  readonly artifactDigest: string;
  readonly policyKey: string;
  readonly authorityRoot: string;
  readonly plan: BudgetPlan;
}

type StorageSync = (handle: FileHandle, target: 'file' | 'directory' | 'authority-root') => Promise<void>;
export interface DurableStorage {
  readonly sync?: StorageSync;
}

export async function runDurableAutonomousValuePilot(
  input: DurablePilotInput,
  runCell: PilotCampaignCellRun,
  storage: DurableStorage = {},
): Promise<PilotCampaignResult> {
  const manifest = validatedManifest(input.manifest);
  const budget = prepareBudget(input.budget, manifest);
  const sync: StorageSync = storage.sync ?? ((handle) => handle.sync());
  if (!/^[a-zA-Z0-9._/:-]{1,512}$/.test(input.configurationKey)) {
    throw new Error('invalid configuration identity');
  }
  if (input.adapterIdentity !== undefined && !/^[a-f0-9]{64}$/.test(input.adapterIdentity)) {
    throw new Error('invalid adapter identity');
  }
  const identity = createHash('sha256').update(JSON.stringify({
    manifest, configurationKey: input.configurationKey, adapterIdentity: input.adapterIdentity,
    budget: budget === undefined ? undefined : { version: 1, approvalDigest: budget.approvalDigest,
      policyKey: budget.policyKey, plan: budget.plan },
  })).digest('hex');
  const directory = budget === undefined ? input.archiveDirectory : await authorityDirectory(budget, sync);
  if (budget === undefined) await mkdir(directory, { recursive: true, mode: 0o700 });
  const claim = join(directory, 'launch.claim');
  try { await mkdir(claim, { mode: 0o700 }); } catch {
    throw new Error('archive already claimed or unavailable; inspect before recovery');
  }
  try {
    await bindArchive(directory, identity, sync);
    const recovered = await recoverArchive(directory, identity, { ...input, manifest }, budget);
    const { saved, reservations } = recovered;
    let reservedMicroUsd = recovered.reservedMicroUsd;
    const result = await runAutonomousValuePilot(manifest, async (cellInput) => {
      const executionId = cellInput.execution.executionId;
      const previous = saved.get(executionId);
      if (previous !== undefined) return previous;
      if (budget !== undefined) {
        const reservation = reserveBudget(budget.plan, reservedMicroUsd, executionId);
        if (!reservation.ok) {
          reservations.set(executionId, 0);
          return { status: 'blocked', reason: 'budget admission refused' };
        }
        reservations.set(executionId, reservation.value);
        reservedMicroUsd += reservation.value;
      }
      await atomicWrite(directory, `${executionId}.json`, { identity, executionId, state: 'admitted',
        reservationMicroUsd: reservations.get(executionId) }, sync);
      return normalizeResult(await runCell(cellInput), input.configurationKey, cellInput.cell.startCommit);
    }, {
      concurrency: 1, stopOnUnknown: true,
      onObservation: async ({ executionId, result }) => {
        await atomicWrite(directory, `${executionId}.json`, {
          identity, executionId, state: 'observed', result,
          reservationMicroUsd: reservations.get(executionId),
        }, sync);
      },
    });
    await atomicWrite(directory, 'report.json', result.report, sync);
    return result;
  } finally { await rmdir(claim); }
}

async function recoverArchive(
  directory: string, identity: string, input: DurablePilotInput, budget: PreparedBudget | undefined,
) {
  const saved = new Map<string, PilotResult>();
  const reservations = new Map<string, number>();
  let reservedMicroUsd = 0;
  for (const execution of createPilotSchedule(input.manifest)) {
    const raw = await readBounded(join(directory, `${execution.executionId}.json`));
    if (raw === undefined) continue;
    const result = readRecord(raw, identity, execution.executionId, input.configurationKey,
      input.manifest.cells[execution.cellId].startCommit);
    if (budget !== undefined) {
      const amount = readReservation(raw, budget.plan, execution.executionId, result);
      reservedMicroUsd += amount;
      reservations.set(execution.executionId, amount);
    }
    saved.set(execution.executionId, result);
  }
  if (budget !== undefined && reservedMicroUsd > budget.plan.budgetMicroUsd) {
    throw new Error('archive reservations exceed budget');
  }
  return { saved, reservations, reservedMicroUsd };
}

function prepareBudget(input: BudgetAuthorityInput | undefined, manifest: AutonomousValueManifest): PreparedBudget | undefined {
  if (input === undefined) return undefined;
  const approval = parsePilotApproval(input.approval, manifest);
  if (!approval.ok || !/^[a-zA-Z0-9._/:-]{1,512}$/.test(input.policyKey)) {
    throw new Error('invalid budget approval or policy');
  }
  const approvalDigest = `sha256:${createHash('sha256').update(JSON.stringify(approval.value)).digest('hex')}`;
  if (input.provenance.kind !== 'verified' || input.provenance.approvalDigest !== approvalDigest) {
    throw new Error('budget approval provenance unavailable');
  }
  const plan = parseBudgetPlan({ budgetUsd: approval.value.budgetUsd, reservations: input.reservations },
    createPilotSchedule(manifest).map((execution) => execution.executionId));
  if (!plan.ok) throw new Error('invalid budget reservations');
  return { approvalDigest, artifactDigest: approval.value.artifactDigest, policyKey: input.policyKey,
    authorityRoot: input.authorityRoot, plan: plan.value };
}

async function authorityDirectory(budget: PreparedBudget, sync: StorageSync): Promise<string> {
  const root = await realpath(budget.authorityRoot);
  if (root !== resolve(budget.authorityRoot) || !(await lstat(root)).isDirectory()) {
    throw new Error('budget authority root must be canonical and preexisting');
  }
  const directory = join(root, budget.approvalDigest.slice(7));
  try { await mkdir(directory, { mode: 0o700 }); } catch (error) {
    if (!record(error) || error['code'] !== 'EEXIST') throw new Error('budget authority creation failed');
  }
  if (!(await lstat(directory)).isDirectory()) throw new Error('budget authority is not a directory');
  // Also sync on reopening: a prior creation may have stopped before its parent sync.
  const parent = await open(root, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await sync(parent, 'authority-root'); } finally { await parent.close(); }
  return directory;
}

function readReservation(raw: unknown, plan: BudgetPlan, executionId: string, result: PilotResult): number {
  const expected = plan.reservations.find((entry) => entry.executionId === executionId)?.microUsd;
  if (!record(raw) || typeof raw['reservationMicroUsd'] !== 'number'
    || !Number.isSafeInteger(raw['reservationMicroUsd']) || expected === undefined
    || (raw['reservationMicroUsd'] !== expected && raw['reservationMicroUsd'] !== 0)
    || (raw['reservationMicroUsd'] === 0 && (raw['state'] !== 'observed' || result.status !== 'blocked'))) {
    throw new Error('invalid archive reservation');
  }
  return raw['reservationMicroUsd'];
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

async function bindArchive(directory: string, identity: string, sync: StorageSync): Promise<void> {
  const existing = await readBounded(join(directory, 'identity.json'));
  if (existing === undefined) {
    await atomicWrite(directory, 'identity.json', { schemaVersion: 1, identity }, sync);
  } else if (!record(existing) || existing['schemaVersion'] !== 1 || existing['identity'] !== identity) {
    throw new Error('archive identity mismatch');
  }
}

async function atomicWrite(directory: string, name: string, value: object, sync: StorageSync): Promise<void> {
  const temporary = join(directory, `${name}.pending`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await sync(handle, 'file'); }
  finally { await handle.close(); }
  await rename(temporary, join(directory, name));
  const directoryHandle = await open(directory, constants.O_RDONLY);
  try { await sync(directoryHandle, 'directory'); } finally { await directoryHandle.close(); }
}
