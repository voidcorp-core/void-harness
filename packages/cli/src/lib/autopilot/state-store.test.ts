import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunState } from './run-state.js';
import { listRunIds, readRun, runDirectory, writeRun } from './state-store.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

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

function repo(): string {
  return mkdtempSync(join(tmpdir(), 'vh-store-'));
}

describe('writeRun / readRun', () => {
  it('round-trips a run through the store', () => {
    const root = repo();
    writeRun(root, state());

    expect(readRun(root, 'run-a')).toEqual(state());
  });

  it('returns undefined for a run this clone never started', () => {
    expect(readRun(repo(), 'run-unknown')).toBeUndefined();
  });

  it('leaves no temporary file behind on a successful write', () => {
    const root = repo();
    writeRun(root, state());

    expect(readdirSync(runDirectory(root, 'run-a')).sort()).toEqual(['state.json']);
  });

  it('replaces a previous state atomically rather than appending to it', () => {
    const root = repo();
    writeRun(root, state());
    writeRun(root, state({ trackerSynced: true }));

    expect(readRun(root, 'run-a')?.trackerSynced).toBe(true);
    expect(readFileSync(join(runDirectory(root, 'run-a'), 'state.json'), 'utf8')).not.toContain('}{');
  });

  it('writes a file only the user can read, because a run cursor names branches and tickets', () => {
    const root = repo();
    writeRun(root, state());

    const mode = statSync(join(runDirectory(root, 'run-a'), 'state.json')).mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it('works under a path containing spaces', () => {
    const root = join(repo(), 'my projects', 'void harness');
    mkdirSync(root, { recursive: true });
    writeRun(root, state());

    expect(readRun(root, 'run-a')?.runId).toBe('run-a');
  });

  it('refuses a run id that would escape the run directory', () => {
    const root = repo();

    expect(() => writeRun(root, state({ runId: '../../etc' }))).toThrow(/runId/);
    expect(() => readRun(root, '../../etc')).toThrow(/runId/);
  });

  it('refuses an absolute run id', () => {
    expect(() => readRun(repo(), '/etc/passwd')).toThrow(/runId/);
  });

  it('fails closed on a truncated state and leaves the file untouched', () => {
    const root = repo();
    writeRun(root, state());
    const file = join(runDirectory(root, 'run-a'), 'state.json');
    const truncated = readFileSync(file, 'utf8').slice(0, 60);
    writeFileSync(file, truncated);

    expect(() => readRun(root, 'run-a')).toThrow();
    expect(readFileSync(file, 'utf8')).toBe(truncated);
  });

  it('fails closed on a legacy state and leaves it intact for inspection', () => {
    const root = repo();
    const dir = runDirectory(root, 'run-legacy');
    mkdirSync(dir, { recursive: true });
    const legacy = JSON.stringify({ runId: 'run-legacy', clusters: [] });
    writeFileSync(join(dir, 'state.json'), legacy);

    expect(() => readRun(root, 'run-legacy')).toThrow(/schemaVersion/);
    expect(readFileSync(join(dir, 'state.json'), 'utf8')).toBe(legacy);
  });

  it('refuses to read a state that is a symlink to somewhere else', () => {
    const root = repo();
    const outside = join(root, 'outside.json');
    writeFileSync(outside, JSON.stringify(state()));
    const dir = runDirectory(root, 'run-link');
    mkdirSync(dir, { recursive: true });
    symlinkSync(outside, join(dir, 'state.json'));

    expect(() => readRun(root, 'run-link')).toThrow(/symlink/i);
  });

  it('refuses to write over a state that is a symlink', () => {
    const root = repo();
    const outside = join(root, 'outside.json');
    writeFileSync(outside, 'original');
    const dir = runDirectory(root, 'run-a');
    mkdirSync(dir, { recursive: true });
    symlinkSync(outside, join(dir, 'state.json'));

    expect(() => writeRun(root, state())).toThrow(/symlink/i);
    expect(readFileSync(outside, 'utf8')).toBe('original');
  });

  it('surfaces a write it could not complete instead of reporting success', () => {
    const root = repo();
    const dir = runDirectory(root, 'run-a');
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o500);

    try {
      expect(() => writeRun(root, state())).toThrow();
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe('listRunIds', () => {
  it('returns nothing when no run was ever started', () => {
    expect(listRunIds(repo())).toEqual([]);
  });

  it('lists the runs this clone knows, sorted', () => {
    const root = repo();
    writeRun(root, state({ runId: 'run-b' }));
    writeRun(root, state({ runId: 'run-a' }));

    expect(listRunIds(root)).toEqual(['run-a', 'run-b']);
  });

  it('ignores a stray file that is not a run directory', () => {
    const root = repo();
    writeRun(root, state());
    writeFileSync(join(root, '.void', 'machine', 'autopilot', 'notes.txt'), 'hello');

    expect(listRunIds(root)).toEqual(['run-a']);
  });

  it('ignores a run directory carrying no state file', () => {
    const root = repo();
    writeRun(root, state());
    mkdirSync(join(root, '.void', 'machine', 'autopilot', 'run-empty'), { recursive: true });

    expect(listRunIds(root)).toEqual(['run-a']);
  });
});
