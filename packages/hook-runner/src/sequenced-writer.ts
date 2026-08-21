import { randomUUID as nodeRandomUUID } from 'node:crypto';
import {
  constants,
} from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { voidReadPath } from './void-layout.js';
import {
  replayEventLog,
  serializeEvent,
  type CanonicalEvent,
  type EventDraft,
} from '@voidcorp/mission-engine/events';

export const MAX_EVENT_LOG_BYTES = 8 * 1024 * 1024;
const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
const EVENT_ID = /^evt_[A-Za-z0-9_-]{8,100}$/;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_ATTEMPTS = 2_000;
const LOCK_RETRY_MS = 2;

export interface SequencedWriteOptions {
  readonly root: string;
  readonly missionId: string;
  readonly draft: EventDraft;
  readonly now?: Date;
  readonly randomUUID?: () => string;
  readonly lockStaleMs?: number;
  readonly lockAttempts?: number;
  readonly validate?: (
    events: readonly CanonicalEvent[],
  ) => void | Promise<void>;
}

export interface IdempotentSequencedWriteOptions extends SequencedWriteOptions {
  readonly eventId: string;
}

export interface SequencedWriteResult {
  readonly event: CanonicalEvent;
  readonly appended: boolean;
}

type InternalWriteOptions = SequencedWriteOptions & {
  readonly eventId?: string;
};

function code(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (code(error) === 'ENOENT') return false;
    throw error;
  }
}

async function safeRunDirectory(root: string, missionId: string): Promise<string> {
  if (!MISSION_ID.test(missionId)) {
    throw new Error('HOOK_INVALID_MISSION_ID: expected mis_<opaque-id>');
  }
  const absoluteRoot = resolve(root);
  const canonicalRoot = await realpath(absoluteRoot);
  // Per mission, not per project: a mission already journaling at the pre-split
  // path keeps writing there until it ends. Writing unconditionally to the new
  // location split an in-flight mission across both halves the moment the harness
  // was upgraded mid-session, and a sequenced log cannot be concatenated back.
  const run = voidReadPath(absoluteRoot, 'runs', missionId);
  let ancestor = run;
  while (!(await exists(ancestor))) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const canonicalAncestor = await realpath(ancestor);
  if (!within(canonicalRoot, canonicalAncestor)) {
    throw new Error('HOOK_PATH_ESCAPE: run directory resolves outside project');
  }
  await mkdir(run, { recursive: true, mode: 0o700 });
  const canonicalRun = await realpath(run);
  if (!within(canonicalRoot, canonicalRun)) {
    throw new Error('HOOK_PATH_ESCAPE: run directory resolves outside project');
  }
  return run;
}

async function rejectSymlink(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`HOOK_UNSAFE_FILE: ${path} must be a regular file`);
    }
  } catch (error) {
    if (code(error) !== 'ENOENT') throw error;
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

interface HeldLock {
  readonly path: string;
  readonly token: string;
}

async function acquireLock(
  path: string,
  staleMs: number,
  attempts: number,
): Promise<HeldLock> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = nodeRandomUUID();
    try {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ token, pid: process.pid, acquiredAt: Date.now() }),
          'utf8',
        );
      } finally {
        await handle.close();
      }
      return { path, token };
    } catch (error) {
      if (code(error) !== 'EEXIST') throw error;
      const info = await lstat(path).catch((statError: unknown) => {
        if (code(statError) === 'ENOENT') return undefined;
        throw statError;
      });
      if (info === undefined) continue;
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error('HOOK_UNSAFE_LOCK: lock must be a regular file');
      }
      if (Date.now() - info.mtimeMs > staleMs) {
        await unlink(path).catch((unlinkError: unknown) => {
          if (code(unlinkError) !== 'ENOENT') throw unlinkError;
        });
        continue;
      }
      await wait(LOCK_RETRY_MS);
    }
  }
  throw new Error('HOOK_LOCK_TIMEOUT: event sequencer remained busy');
}

async function releaseLock(lock: HeldLock): Promise<void> {
  try {
    const raw = await readFile(lock.path, 'utf8');
    const parsed = JSON.parse(raw) as { token?: unknown };
    if (parsed.token === lock.token) await unlink(lock.path);
  } catch (error) {
    if (code(error) !== 'ENOENT') throw error;
  }
}

interface SequenceState {
  readonly seq: number;
  readonly logBytes: number;
}

async function readSequenceState(
  statePath: string,
  logPath: string,
  logBytes: number,
): Promise<number> {
  try {
    const raw = JSON.parse(await readFile(statePath, 'utf8')) as Partial<SequenceState>;
    if (
      Number.isSafeInteger(raw.seq)
      && (raw.seq ?? -1) >= 0
      && raw.logBytes === logBytes
    ) {
      return raw.seq ?? 0;
    }
  } catch {
    // A missing/corrupt/stale state is reconstructed from the append-only log.
  }
  if (logBytes === 0) return 0;
  return replayEventLog(await readFile(logPath, 'utf8')).lastSeq;
}

async function ensureLineBoundary(logPath: string, logBytes: number): Promise<number> {
  if (logBytes === 0) return 0;
  const handle = await open(logPath, 'r');
  try {
    const finalByte = Buffer.alloc(1);
    await handle.read(finalByte, 0, 1, logBytes - 1);
    if (finalByte[0] === 0x0a) return logBytes;
  } finally {
    await handle.close();
  }
  const append = await open(
    logPath,
    constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    await append.writeFile('\n', 'utf8');
  } finally {
    await append.close();
  }
  return logBytes + 1;
}

async function appendLine(logPath: string, line: string): Promise<number> {
  const flags = constants.O_APPEND
    | constants.O_CREAT
    | constants.O_WRONLY
    | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(logPath, flags, 0o600);
  try {
    await handle.writeFile(`${line}\n`, 'utf8');
    return (await handle.stat()).size;
  } finally {
    await handle.close();
  }
}

async function writeSequenceState(
  statePath: string,
  state: SequenceState,
  randomUUID: () => string,
): Promise<void> {
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(state), 'utf8');
  } finally {
    await handle.close();
  }
  await rename(temporary, statePath);
}

function sameDraft(
  event: CanonicalEvent,
  options: InternalWriteOptions,
): boolean {
  return event.missionId === options.missionId
    && event.source === options.draft.source
    && event.kind === options.draft.kind
    && event.subject === options.draft.subject
    && event.correlationId === options.draft.correlationId
    && event.causationId === options.draft.causationId
    && JSON.stringify(event.payload) === JSON.stringify(options.draft.payload);
}

async function existingIdempotentEvent(
  logPath: string,
  options: InternalWriteOptions,
  currentBytes: number,
): Promise<CanonicalEvent | undefined> {
  if (options.eventId === undefined || currentBytes === 0) return undefined;
  const stream = replayEventLog(await readFile(logPath, 'utf8'));
  if (stream.continuity === 'partial' || stream.duplicateEventIds > 0) {
    throw new Error('HOOK_EVENT_LOG_INTEGRITY: continuity cannot be proved');
  }
  const existing = stream.events.find((event) => event.eventId === options.eventId);
  if (existing !== undefined && !sameDraft(existing, options)) {
    throw new Error('HOOK_EVENT_ID_CONFLICT: event ID belongs to another draft');
  }
  return existing;
}

async function currentCanonicalEvents(
  logPath: string,
  currentBytes: number,
): Promise<readonly CanonicalEvent[]> {
  if (currentBytes === 0) return [];
  const stream = replayEventLog(await readFile(logPath, 'utf8'));
  if (stream.continuity === 'partial' || stream.duplicateEventIds > 0) {
    throw new Error('HOOK_EVENT_LOG_INTEGRITY: continuity cannot be proved');
  }
  return stream.events;
}

async function writeSequencedEventInternal(
  options: InternalWriteOptions,
): Promise<SequencedWriteResult> {
  if (options.eventId !== undefined && !EVENT_ID.test(options.eventId)) {
    throw new Error('HOOK_INVALID_EVENT_ID: expected evt_<opaque-id>');
  }
  const run = await safeRunDirectory(options.root, options.missionId);
  const logPath = join(run, 'events.jsonl');
  const statePath = join(run, '.seq.state');
  const lockPath = join(run, '.seq.lock');
  await Promise.all([
    rejectSymlink(logPath),
    rejectSymlink(statePath),
    rejectSymlink(lockPath),
  ]);
  const lock = await acquireLock(
    lockPath,
    options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS,
    options.lockAttempts ?? DEFAULT_LOCK_ATTEMPTS,
  );
  const randomUUID = options.randomUUID ?? nodeRandomUUID;
  try {
    await rejectSymlink(logPath);
    const currentBytes = await stat(logPath)
      .then((value) => value.size)
      .catch((error: unknown) => {
        if (code(error) === 'ENOENT') return 0;
        throw error;
      });
    if (currentBytes > MAX_EVENT_LOG_BYTES) {
      throw new Error('HOOK_EVENT_LOG_FULL: rotate or archive the run');
    }
    const existing = await existingIdempotentEvent(
      logPath,
      options,
      currentBytes,
    );
    if (existing !== undefined) {
      return Object.freeze({ event: existing, appended: false });
    }
    if (options.validate !== undefined) {
      await options.validate(await currentCanonicalEvents(logPath, currentBytes));
    }
    if (currentBytes >= MAX_EVENT_LOG_BYTES) {
      throw new Error('HOOK_EVENT_LOG_FULL: rotate or archive the run');
    }
    const boundedBytes = await ensureLineBoundary(logPath, currentBytes);
    const previousSeq = await readSequenceState(
      statePath,
      logPath,
      boundedBytes,
    );
    const event: CanonicalEvent = {
      schemaVersion: 1,
      seq: previousSeq + 1,
      eventId: options.eventId ?? `evt_${randomUUID()}`,
      missionId: options.missionId,
      ts: (options.now ?? new Date()).toISOString(),
      ...options.draft,
    };
    const line = serializeEvent(event);
    if (boundedBytes + Buffer.byteLength(line) + 1 > MAX_EVENT_LOG_BYTES) {
      throw new Error('HOOK_EVENT_LOG_FULL: rotate or archive the run');
    }
    const logBytes = await appendLine(logPath, line);
    await writeSequenceState(
      statePath,
      { seq: event.seq, logBytes },
      randomUUID,
    );
    return Object.freeze({ event, appended: true });
  } finally {
    await releaseLock(lock);
  }
}

export async function writeSequencedEvent(
  options: SequencedWriteOptions,
): Promise<CanonicalEvent> {
  return (await writeSequencedEventInternal(options)).event;
}

export async function writeSequencedEventOnce(
  options: IdempotentSequencedWriteOptions,
): Promise<SequencedWriteResult> {
  return writeSequencedEventInternal(options);
}
