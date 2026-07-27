import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayEventLog } from '@voidcorp/mission-engine';
import {
  MAX_EVENT_LOG_BYTES,
  writeSequencedEvent,
  writeSequencedEventOnce,
} from './sequenced-writer.js';

const MISSION_ID = 'mis_0123456789abcdef0123456789abcdef';

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'void-events-'));
}

function draft(index: number) {
  return {
    source: 'runtime:codex',
    kind: 'runtime.tool.started',
    subject: `tool:test-${index}`,
    correlationId: MISSION_ID,
    payload: { category: 'tool', tool: `test-${index}` },
  } as const;
}

describe('writeSequencedEvent', () => {
  it('assigns 100 concurrent writers the exact sequence 1..100', async () => {
    const root = await tempRoot();
    const events = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        writeSequencedEvent({
          root,
          missionId: MISSION_ID,
          draft: draft(index),
        }),
      ),
    );

    expect(events.map((entry) => entry.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    const body = await readFile(
      join(root, '.void', 'runs', MISSION_ID, 'events.jsonl'),
      'utf8',
    );
    const replayed = replayEventLog(body);
    expect(replayed.events).toHaveLength(100);
    expect(replayed.continuity).toBe('complete');
  }, 30_000);

  it('appends a stable event ID once under concurrent retries', async () => {
    const root = await tempRoot();
    const writes = await Promise.all(
      Array.from({ length: 10 }, () => writeSequencedEventOnce({
        root,
        missionId: MISSION_ID,
        eventId: `evt_${'a'.repeat(64)}`,
        draft: draft(1),
      })),
    );
    const replayed = replayEventLog(await readFile(
      join(root, '.void', 'runs', MISSION_ID, 'events.jsonl'),
      'utf8',
    ));

    expect(replayed.events).toHaveLength(1);
    expect(writes.filter((item) => item.appended)).toHaveLength(1);
    expect(new Set(writes.map((item) => item.event.eventId))).toEqual(
      new Set([`evt_${'a'.repeat(64)}`]),
    );

    await expect(writeSequencedEventOnce({
      root,
      missionId: MISSION_ID,
      eventId: `evt_${'a'.repeat(64)}`,
      draft: draft(2),
    })).rejects.toThrow('HOOK_EVENT_ID_CONFLICT');
  });

  it('rejects invalid stable IDs and partial logs for idempotent writes', async () => {
    const invalidRoot = await tempRoot();
    await expect(writeSequencedEventOnce({
      root: invalidRoot,
      missionId: MISSION_ID,
      eventId: 'caller-controlled',
      draft: draft(1),
    })).rejects.toThrow('HOOK_INVALID_EVENT_ID');

    const partialRoot = await tempRoot();
    const run = join(partialRoot, '.void', 'runs', MISSION_ID);
    await mkdir(run, { recursive: true });
    await writeFile(join(run, 'events.jsonl'), '{"partial"\n', 'utf8');

    await expect(writeSequencedEventOnce({
      root: partialRoot,
      missionId: MISSION_ID,
      eventId: `evt_${'b'.repeat(64)}`,
      draft: draft(1),
    })).rejects.toThrow('HOOK_EVENT_LOG_INTEGRITY');
  });

  it('isolates a partial tail before appending the next valid event', async () => {
    const root = await tempRoot();
    const run = join(root, '.void', 'runs', MISSION_ID);
    await mkdir(run, { recursive: true });
    await writeFile(join(run, 'events.jsonl'), '{"partial"', 'utf8');

    const written = await writeSequencedEvent({
      root,
      missionId: MISSION_ID,
      draft: draft(1),
    });
    const replayed = replayEventLog(
      await readFile(join(run, 'events.jsonl'), 'utf8'),
    );

    expect(written.seq).toBe(1);
    expect(replayed.events).toEqual([written]);
    expect(replayed.invalidLines).toBe(1);
  });

  it('recovers a stale lock but never follows a run-root symlink', async () => {
    const root = await tempRoot();
    const run = join(root, '.void', 'runs', MISSION_ID);
    await mkdir(run, { recursive: true });
    const lock = join(run, '.seq.lock');
    await writeFile(lock, 'stale', 'utf8');
    const old = new Date(Date.now() - 120_000);
    await utimes(lock, old, old);

    await expect(
      writeSequencedEvent({
        root,
        missionId: MISSION_ID,
        draft: draft(1),
        lockStaleMs: 1_000,
      }),
    ).resolves.toMatchObject({ seq: 1 });

    const escapedRoot = await tempRoot();
    const outside = await tempRoot();
    await mkdir(join(escapedRoot, '.void'), { recursive: true });
    await symlink(outside, join(escapedRoot, '.void', 'runs'));
    await expect(
      writeSequencedEvent({
        root: escapedRoot,
        missionId: MISSION_ID,
        draft: draft(2),
      }),
    ).rejects.toThrow('HOOK_PATH_ESCAPE');
    expect(await readFile(join(run, 'events.jsonl'), 'utf8')).toContain('"seq":1');
  });

  it('refuses to append beyond the run log budget', async () => {
    const root = await tempRoot();
    const run = join(root, '.void', 'runs', MISSION_ID);
    await mkdir(run, { recursive: true });
    const log = join(run, 'events.jsonl');
    await writeFile(log, Buffer.alloc(MAX_EVENT_LOG_BYTES, 'x'));
    await chmod(log, 0o600);

    await expect(
      writeSequencedEvent({
        root,
        missionId: MISSION_ID,
        draft: draft(1),
      }),
    ).rejects.toThrow('HOOK_EVENT_LOG_FULL');
  });
});
