import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  type RunState,
  deserializeState,
  initRunState,
  markCluster,
  nextPending,
  readState,
  reconcile,
  serializeState,
  writeStateAtomic,
} from './run-state.js';

function sample(): RunState {
  return initRunState('run-1', 'develop', [
    { id: 'a', base: 'develop' },
    { id: 'b', base: 'cluster/a' },
  ]);
}

describe('run-state pure operations', () => {
  test('initRunState starts every cluster pending', () => {
    const s = sample();
    expect(s.runId).toBe('run-1');
    expect(s.base).toBe('develop');
    expect(s.clusters.map((c) => [c.id, c.status, c.branch])).toEqual([
      ['a', 'pending', 'cluster/a'],
      ['b', 'pending', 'cluster/b'],
    ]);
  });

  test('serialize/deserialize round-trips', () => {
    const s = sample();
    expect(deserializeState(serializeState(s))).toEqual(s);
  });

  test('markCluster updates one cluster immutably', () => {
    const s = sample();
    const s2 = markCluster(s, 'a', { status: 'pr-open', pr: 'http://pr/1' });
    expect(s.clusters[0]?.status).toBe('pending'); // original untouched
    expect(s2.clusters[0]).toMatchObject({ id: 'a', status: 'pr-open', pr: 'http://pr/1' });
  });

  test('nextPending returns the first pending cluster, then undefined', () => {
    let s = sample();
    expect(nextPending(s)?.id).toBe('a');
    s = markCluster(s, 'a', { status: 'merged' });
    expect(nextPending(s)?.id).toBe('b');
    s = markCluster(s, 'b', { status: 'blocked' });
    expect(nextPending(s)).toBeUndefined();
  });
});

describe('reconcile against remote reality (M3 — not a replayed cursor)', () => {
  test('a remembered open PR is reconciled from the remote', () => {
    const s = sample();
    const r = reconcile(s, [{ cluster: 'a', pr: 'http://pr/9' }]);
    expect(r.clusters[0]).toMatchObject({ id: 'a', status: 'pr-open', pr: 'http://pr/9' });
  });

  test('a PR we opened that is gone from the remote merged since', () => {
    const s = markCluster(sample(), 'a', { status: 'pr-open', pr: 'http://pr/9' });
    const r = reconcile(s, []); // remote shows no open PR for a
    expect(r.clusters[0]?.status).toBe('merged');
  });

  test('terminal states are idempotent under reconcile', () => {
    let s = markCluster(sample(), 'a', { status: 'merged' });
    s = markCluster(s, 'b', { status: 'blocked' });
    const r = reconcile(s, []);
    expect(r.clusters.map((c) => c.status)).toEqual(['merged', 'blocked']);
  });
});

describe('atomic disk persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-state-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('writeStateAtomic then readState round-trips and leaves no temp file', () => {
    const s = sample();
    writeStateAtomic(dir, s);
    expect(readState(dir)).toEqual(s);
    // no stray *.tmp left behind by the temp+rename
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  test('readState returns undefined when no state file exists', () => {
    expect(readState(dir)).toBeUndefined();
    expect(existsSync(join(dir, 'state.json'))).toBe(false);
  });
});
