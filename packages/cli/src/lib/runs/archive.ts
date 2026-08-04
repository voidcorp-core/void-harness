import { randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { voidLocalReadPath } from '@voidcorp/hook-runner';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type {
  EvidenceContext,
  MissionVerdictStatus,
} from '@voidcorp/mission-engine';
import {
  appendMissionEvent,
  eventLogPath,
  inspectMission,
  missionCreatedAt,
} from './store.js';

const gzipAsync = promisify(gzip);
const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;

export interface MissionArchive {
  readonly path: string;
  readonly verdict: MissionVerdictStatus;
}

export interface PruneCandidate {
  readonly missionId: string;
  readonly path: string;
  readonly createdAt: string;
  readonly deleted: boolean;
}

function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

async function safeDirectory(root: string, relativePath: string): Promise<string> {
  const absoluteRoot = resolve(root);
  const canonicalRoot = await realpath(absoluteRoot);
  const directory = join(absoluteRoot, relativePath);
  let ancestor = directory;
  while (!(await exists(ancestor))) {
    const parent = resolve(ancestor, '..');
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const canonicalAncestor = await realpath(ancestor);
  if (!within(canonicalRoot, canonicalAncestor)) {
    throw new Error('MISSION_PATH_ESCAPE: archive ancestor is unsafe');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  const canonical = await realpath(directory);
  if (
    info.isSymbolicLink()
    || !info.isDirectory()
    || !within(canonicalRoot, canonical)
  ) {
    throw new Error('MISSION_PATH_ESCAPE: archive directory is unsafe');
  }
  return directory;
}

export async function archiveMission(
  root: string,
  missionId: string,
  context: EvidenceContext,
): Promise<MissionArchive> {
  if (!MISSION_ID.test(missionId)) {
    throw new Error('MISSION_INVALID_ID: expected mis_<opaque-id>');
  }
  const inspected = await inspectMission(root, missionId, context);
  if (
    inspected.verdict.status !== 'verified'
    && inspected.verdict.status !== 'shipped-with-exception'
  ) {
    throw new Error(
      `MISSION_NOT_COMPLETED: verdict is ${inspected.verdict.status}`,
    );
  }
  const directory = await safeDirectory(root, join('.void', 'local', 'archives'));
  const target = join(directory, `${missionId}.jsonl.gz`);
  if (await exists(target)) {
    throw new Error(`MISSION_ALREADY_ARCHIVED: ${missionId}`);
  }
  const temporary = join(directory, `.${missionId}.${randomUUID()}.tmp`);
  try {
    await appendMissionEvent(root, missionId, {
      source: 'void-harness:mission',
      kind: 'mission.archived',
      subject: 'mission',
      correlationId: missionId,
      payload: {
        verdict: inspected.verdict.status,
        diffHash: context.dependencies['git:working-tree'] ?? 'unknown',
      },
    });
    const logPath = await eventLogPath(root, missionId);
    const compressed = await gzipAsync(await readFile(logPath), { level: 9 });
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(compressed);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return { path: target, verdict: inspected.verdict.status };
}

export async function pruneMissions(
  root: string,
  olderThanDays: number,
  apply: boolean,
  now = new Date(),
): Promise<readonly PruneCandidate[]> {
  if (
    !Number.isFinite(olderThanDays)
    || olderThanDays < 1
    || !Number.isInteger(olderThanDays)
  ) {
    throw new Error('MISSION_INVALID_RETENTION: days must be a positive integer');
  }
  const archives = await safeDirectory(root, join('.void', 'local', 'archives'));
  const entries = await readdir(archives, { withFileTypes: true });
  const cutoff = now.getTime() - olderThanDays * 24 * 60 * 60 * 1_000;
  const candidates: PruneCandidate[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const match = /^(mis_[A-Za-z0-9_-]{8,100})\.jsonl\.gz$/.exec(entry.name);
    if (!entry.isFile() || match?.[1] === undefined) continue;
    const missionId = match[1];
    let createdAt: number;
    try {
      createdAt = await missionCreatedAt(root, missionId);
    } catch {
      continue;
    }
    if (createdAt >= cutoff) continue;
    const run = voidLocalReadPath(resolve(root), 'runs', missionId);
    const info = await lstat(run);
    const canonicalRoot = await realpath(resolve(root));
    const canonicalRun = await realpath(run);
    if (
      info.isSymbolicLink()
      || !info.isDirectory()
      || !within(canonicalRoot, canonicalRun)
    ) {
      throw new Error('MISSION_UNSAFE_RUN: refusing to prune unsafe path');
    }
    if (apply) await rm(run, { recursive: true });
    candidates.push({
      missionId,
      path: run,
      createdAt: new Date(createdAt).toISOString(),
      deleted: apply,
    });
  }
  return candidates;
}
