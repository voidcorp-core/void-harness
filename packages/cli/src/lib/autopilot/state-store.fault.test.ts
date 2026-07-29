// Fault injection around the atomic write. Isolated in its own file because it
// mocks node:fs, and the rest of the store's tests must exercise the real one.
//
// The property under test is the only one that matters for a cursor: a reader
// must see the whole previous state or the whole new one, never a fragment. So
// every failure before the rename has to leave the published file untouched.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunState } from './run-state.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

const failures = { write: false, fsync: false, rename: false };

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeSync: (...args: Parameters<typeof actual.writeSync>) => {
      if (failures.write) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return actual.writeSync(...args);
    },
    fsyncSync: (...args: Parameters<typeof actual.fsyncSync>) => {
      if (failures.fsync) throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      return actual.fsyncSync(...args);
    },
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (failures.rename) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return actual.renameSync(...args);
    },
  };
});

const { runDirectory, writeRun, readRun } = await import('./state-store.js');

function state(over: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId: 'run-a',
    clusterId: 'cluster-1',
    programId: 'void-harness-v3',
    startedAt: '2026-07-29T10:00:00.000Z',
    base: { branch: 'main', sha: SHA },
    tickets: [{ id: 'DEV-1', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null }],
    integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
    trackerSynced: false,
    ...over,
  };
}

function repoWithState(): string {
  const root = mkdtempSync(join(tmpdir(), 'vh-fault-'));
  writeRun(root, state());
  return root;
}

afterEach(() => {
  failures.write = false;
  failures.fsync = false;
  failures.rename = false;
});

describe('atomic write under injected faults', () => {
  it.each([
    ['a full disk during the write', 'write' as const],
    ['an i/o error at fsync', 'fsync' as const],
    ['a failure at rename', 'rename' as const],
  ])('preserves the previous cursor through %s', (_label, stage) => {
    const root = repoWithState();
    const before = readFileSync(join(runDirectory(root, 'run-a'), 'state.json'), 'utf8');

    failures[stage] = true;
    expect(() => writeRun(root, state({ trackerSynced: true }))).toThrow();

    // The published file is byte-identical, and the run still reads as it was.
    expect(readFileSync(join(runDirectory(root, 'run-a'), 'state.json'), 'utf8')).toBe(before);
    expect(readRun(root, 'run-a')?.trackerSynced).toBe(false);
  });

  it.each([
    ['a full disk during the write', 'write' as const],
    ['an i/o error at fsync', 'fsync' as const],
    ['a failure at rename', 'rename' as const],
  ])('leaves no temporary file behind after %s', (_label, stage) => {
    const root = repoWithState();

    failures[stage] = true;
    expect(() => writeRun(root, state({ trackerSynced: true }))).toThrow();

    expect(readdirSync(runDirectory(root, 'run-a')).sort()).toEqual(['state.json']);
  });

  it('creates no cursor at all when the very first write fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'vh-fault-'));

    failures.fsync = true;
    expect(() => writeRun(root, state())).toThrow();

    expect(readRun(root, 'run-a')).toBeUndefined();
  });

  it('never reports success on a failed write, so the caller cannot record progress', () => {
    const root = repoWithState();
    // A silent failure here is the dangerous one: the run would carry on
    // believing its cursor advanced, and resume would replay from the old state.
    failures.rename = true;
    let threw = false;
    try {
      writeRun(root, state({ trackerSynced: true }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('does not disturb a neighbouring run', () => {
    const root = repoWithState();
    writeRun(root, state({ runId: 'run-b' }));
    const neighbour = readFileSync(join(runDirectory(root, 'run-b'), 'state.json'), 'utf8');

    failures.write = true;
    expect(() => writeRun(root, state({ trackerSynced: true }))).toThrow();

    expect(readFileSync(join(runDirectory(root, 'run-b'), 'state.json'), 'utf8')).toBe(neighbour);
  });

  it('refuses a cursor an interrupted write left half-serialised', () => {
    const root = mkdtempSync(join(tmpdir(), 'vh-fault-'));
    const dir = runDirectory(root, 'run-torn');
    mkdirSync(dir, { recursive: true });
    // What a rename without fsync can publish: the file exists, the bytes do not.
    writeFileSync(join(dir, 'state.json'), '');

    expect(() => readRun(root, 'run-torn')).toThrow();
  });
});
