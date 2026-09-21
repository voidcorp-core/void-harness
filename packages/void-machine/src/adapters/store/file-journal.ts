// tdd-cover: e2e packages/void-machine/test/file-journal-contract.test.ts
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, link, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { JournalAppend, JournalRead, MissionJournal } from '../../runtime/journal.js';

export const MISSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RECORD_NAME = /^(\d{6})\.json$/;
const MAX_RECORDS = 16;
const MAX_RECORD_BYTES = 262_144;

function code(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' ? error.code : undefined;
}

function recordName(revision: number): string {
  return `${String(revision).padStart(6, '0')}.json`;
}

type Decoded = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

async function readRecord(path: string): Promise<Decoded> {
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return { ok: false, reason: 'record cannot be opened as a regular file' };
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) return { ok: false, reason: 'record is not a regular file' };
    if (metadata.size > MAX_RECORD_BYTES) return { ok: false, reason: 'record exceeds the byte limit' };
    const bytes = await handle.readFile();
    if (bytes.byteLength > MAX_RECORD_BYTES) return { ok: false, reason: 'record exceeds the byte limit' };
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: false, reason: 'record is not strict UTF-8 JSON' };
  } finally {
    await handle.close();
  }
}

type Listing = JournalRead | { readonly kind: 'revisions'; readonly revisions: readonly number[] };

// The store root is chosen by the caller; a mission directory inside it is never followed.
async function isPlainDirectory(directory: string): Promise<boolean> {
  const metadata = await lstat(directory);
  return metadata.isDirectory() && !metadata.isSymbolicLink();
}

async function listRevisions(directory: string): Promise<Listing> {
  let names: string[];
  try {
    if (!await isPlainDirectory(directory)) return { kind: 'unreadable', reason: 'mission path is not a plain directory' };
    names = await readdir(directory);
  } catch (error) {
    return code(error) === 'ENOENT' ? { kind: 'missing' }
      : { kind: 'unreadable', reason: 'mission directory cannot be listed' };
  }
  const revisions: number[] = [];
  // Hidden names include orphan temporaries of an interrupted append; they are kept.
  for (const name of names.filter((value) => !value.startsWith('.'))) {
    const match = RECORD_NAME.exec(name);
    if (match?.[1] === undefined) return { kind: 'unreadable', reason: `unexpected entry ${name}` };
    revisions.push(Number(match[1]));
  }
  revisions.sort((left, right) => left - right);
  if (revisions.length > MAX_RECORDS) return { kind: 'unreadable', reason: 'mission exceeds the record limit' };
  const gap = revisions.findIndex((revision, index) => revision !== index + 1);
  if (gap >= 0) return { kind: 'unreadable', reason: `revision ${String(gap + 1)} is missing` };
  return { kind: 'revisions', revisions };
}

async function read(root: string, missionId: string): Promise<JournalRead> {
  if (!MISSION_ID_PATTERN.test(missionId)) return { kind: 'unreadable', reason: 'mission identifier is invalid' };
  const directory = join(root, missionId);
  const listing = await listRevisions(directory);
  if (listing.kind !== 'revisions') return listing;
  // A directory left empty by a crash before its first record holds no mission yet.
  if (listing.revisions.length === 0) return { kind: 'missing' };
  const records: unknown[] = [];
  for (const revision of listing.revisions) {
    const record = await readRecord(join(directory, recordName(revision)));
    if (!record.ok) return { kind: 'unreadable', reason: `revision ${String(revision)}: ${record.reason}` };
    records.push(record.value);
  }
  return { kind: 'records', records };
}

async function exists(path: string): Promise<boolean> {
  try {
    await (await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)).close();
    return true;
  } catch {
    return false;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeTemporary(directory: string, bytes: string): Promise<string> {
  // Same directory as the record, so link never crosses a filesystem.
  const temporary = join(directory, `.tmp-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function append(root: string, missionId: string, expected: number, record: unknown): Promise<JournalAppend> {
  if (!MISSION_ID_PATTERN.test(missionId)) return { kind: 'failed', reason: 'mission identifier is invalid' };
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= MAX_RECORDS) {
    return { kind: 'failed', reason: 'mission exceeds the record limit' };
  }
  const bytes = JSON.stringify(record);
  if (Buffer.byteLength(bytes, 'utf8') > MAX_RECORD_BYTES) return { kind: 'failed', reason: 'record exceeds the byte limit' };
  const directory = join(root, missionId);
  let temporary: string;
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await mkdir(directory, { mode: 0o700 }).catch((error: unknown) => {
      if (code(error) !== 'EEXIST') throw error;
    });
    if (!await isPlainDirectory(directory)) return { kind: 'failed', reason: 'mission path is not a plain directory' };
    if (expected > 0 && !await exists(join(directory, recordName(expected)))) {
      return { kind: 'failed', reason: 'expected revision is not recorded' };
    }
    temporary = await writeTemporary(directory, bytes);
  } catch {
    return { kind: 'failed', reason: 'mission directory is not writable' };
  }
  try {
    // link refuses an existing target: this is the compare-and-swap, never rename.
    await link(temporary, join(directory, recordName(expected + 1)));
  } catch (error) {
    await unlink(temporary).catch(() => { /* An orphan temporary is ignored by readers. */ });
    return code(error) === 'EEXIST' ? { kind: 'conflict' } : { kind: 'failed', reason: 'record could not be linked' };
  }
  await unlink(temporary).catch(() => { /* The record is linked; the orphan is ignored by readers. */ });
  try {
    await syncDirectory(directory);
  } catch {
    return { kind: 'unconfirmed', revision: expected + 1, reason: 'mission directory could not be synchronized' };
  }
  return { kind: 'appended', revision: expected + 1 };
}

/** Local append-only journal rooted at an explicit directory; no home or platform default. */
export function createFileJournal(options: { readonly root: string }): MissionJournal {
  return {
    read: (missionId) => read(options.root, missionId),
    append: (missionId, expected, record) => append(options.root, missionId, expected, record),
  };
}
