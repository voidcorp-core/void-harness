import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  deriveMissionVerdict,
  parseEventLine,
  replayEventLog,
  type Evidence,
  type EvidenceContext,
  type EventDraft,
  type EventStreamState,
  type JsonValue,
  type MissionVerdict,
} from '@voidcorp/mission-engine';
import {
  MAX_EVENT_LOG_BYTES,
  writeSequencedEvent,
} from '@voidcorp/hook-runner';
import { collectKnownSecrets, redactText } from './redact.js';

const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;

export type MissionMode = 'fast' | 'team' | 'fortress';

export interface CreateMissionInput {
  readonly missionId: string;
  readonly title: string;
  readonly mode: MissionMode;
  readonly now?: Date;
}

export interface MissionInspection {
  readonly stream: EventStreamState;
  readonly verdict: MissionVerdict;
  readonly quarantineFiles: readonly string[];
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function validMissionId(missionId: string): void {
  if (!MISSION_ID.test(missionId)) {
    throw new Error('MISSION_INVALID_ID: expected mis_<opaque-id>');
  }
}

async function existingRunDirectory(
  root: string,
  missionId: string,
): Promise<string> {
  validMissionId(missionId);
  const canonicalRoot = await realpath(resolve(root));
  const run = join(resolve(root), '.void', 'runs', missionId);
  const info = await lstat(run);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('MISSION_UNSAFE_RUN: run path must be a directory');
  }
  const canonicalRun = await realpath(run);
  if (!within(canonicalRoot, canonicalRun)) {
    throw new Error('MISSION_PATH_ESCAPE: run resolves outside project');
  }
  return run;
}

async function writeMissionMetadata(
  run: string,
  input: CreateMissionInput,
  createdAt: string,
): Promise<void> {
  const path = join(run, 'mission.json');
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(
      `${JSON.stringify({
        schemaVersion: 1,
        missionId: input.missionId,
        title: input.title,
        mode: input.mode,
        createdAt,
      })}\n`,
      'utf8',
    );
  } finally {
    await handle.close();
  }
}

export async function appendMissionEvent(
  root: string,
  missionId: string,
  draft: EventDraft,
  now?: Date,
): ReturnType<typeof writeSequencedEvent> {
  return writeSequencedEvent({
    root,
    missionId,
    draft,
    ...(now === undefined ? {} : { now }),
  });
}

export async function createMission(
  root: string,
  input: CreateMissionInput,
): Promise<void> {
  validMissionId(input.missionId);
  if (
    input.title.length < 1
    || input.title.length > 200
    || [...input.title].some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 0x20 || point === 0x7f;
    })
  ) {
    throw new Error('MISSION_INVALID_TITLE: expected 1 to 200 printable characters');
  }
  if (
    input.mode !== 'fast'
    && input.mode !== 'team'
    && input.mode !== 'fortress'
  ) {
    throw new Error('MISSION_INVALID_MODE: expected fast, team, or fortress');
  }
  const safeInput = {
    ...input,
    title: redactText(input.title, collectKnownSecrets()),
  };
  const run = join(resolve(root), '.void', 'runs', input.missionId);
  try {
    await lstat(run);
    throw new Error(`MISSION_EXISTS: ${input.missionId}`);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  const createdAt = (input.now ?? new Date()).toISOString();
  await appendMissionEvent(
    root,
    input.missionId,
    {
      source: 'void-harness:mission',
      kind: 'mission.started',
      subject: 'mission',
      correlationId: input.missionId,
      payload: {
        title: safeInput.title,
        mode: safeInput.mode,
      },
    },
    input.now,
  );
  await writeMissionMetadata(run, safeInput, createdAt);
}

export async function recordMissionEvidence(
  root: string,
  evidence: Evidence,
): Promise<void> {
  await existingRunDirectory(root, evidence.missionId);
  const serialized = JSON.stringify(evidence);
  if (
    redactText(serialized, collectKnownSecrets()) !== serialized
  ) {
    throw new Error(
      'MISSION_EVIDENCE_CONTAINS_SECRET: redact before sealing the proof',
    );
  }
  await appendMissionEvent(root, evidence.missionId, {
    source: evidence.producer,
    kind: 'evidence.recorded',
    subject: evidence.evidenceId,
    correlationId: evidence.missionId,
    payload: { evidence } as unknown as JsonValue,
  });
}

async function quarantineInvalidLines(
  run: string,
  text: string,
  secrets: readonly string[],
): Promise<readonly string[]> {
  const invalid = text
    .split('\n')
    .map((line, index) => ({ line, index: index + 1, parsed: parseEventLine(line) }))
    .filter((entry) => entry.line.trim() !== '' && !entry.parsed.ok);
  if (invalid.length === 0) return [];
  const directory = join(run, 'quarantine');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new Error('MISSION_UNSAFE_QUARANTINE: expected a directory');
  }
  const paths: string[] = [];
  for (const entry of invalid) {
    const digest = createHash('sha256').update(entry.line).digest('hex');
    const path = join(directory, `${digest}.json`);
    const parsed = entry.parsed;
    const content = JSON.stringify({
      line: entry.index,
      issue: parsed.ok ? 'unknown' : parsed.issue.code,
      content: redactText(entry.line.slice(0, 4_096), secrets),
    });
    try {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(`${content}\n`, 'utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
    paths.push(path);
  }
  return paths;
}

export async function inspectMission(
  root: string,
  missionId: string,
  context: EvidenceContext,
  options: { readonly secrets?: readonly string[] } = {},
): Promise<MissionInspection> {
  const run = await existingRunDirectory(root, missionId);
  const log = join(run, 'events.jsonl');
  const info = await lstat(log);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error('MISSION_UNSAFE_LOG: events.jsonl must be a regular file');
  }
  if (info.size > MAX_EVENT_LOG_BYTES) {
    throw new Error(`MISSION_LOG_TOO_LARGE: ${info.size} bytes`);
  }
  const text = await readFile(log, 'utf8');
  const stream = replayEventLog(text);
  const quarantineFiles = await quarantineInvalidLines(
    run,
    text,
    options.secrets ?? collectKnownSecrets(),
  );
  return {
    stream,
    verdict: deriveMissionVerdict(stream, { ...context, missionId }),
    quarantineFiles,
  };
}

export async function eventLogPath(
  root: string,
  missionId: string,
): Promise<string> {
  return join(await existingRunDirectory(root, missionId), 'events.jsonl');
}

export async function missionCreatedAt(
  root: string,
  missionId: string,
): Promise<number> {
  const run = await existingRunDirectory(root, missionId);
  const metadata = join(run, 'mission.json');
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(metadata);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    return (await stat(run)).birthtimeMs;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error('MISSION_UNSAFE_METADATA: mission.json must be a regular file');
  }
  try {
    const value = JSON.parse(await readFile(metadata, 'utf8')) as {
      createdAt?: unknown;
    };
    const created = typeof value.createdAt === 'string'
      ? Date.parse(value.createdAt)
      : Number.NaN;
    if (Number.isFinite(created)) return created;
  } catch {
    // Legacy/hook-created missions do not necessarily have mission.json.
  }
  return (await stat(run)).birthtimeMs;
}
