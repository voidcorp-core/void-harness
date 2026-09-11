import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDurableEvent, createDurableRun, openDurableRunStore } from './durable-run.js';

const leases = 'lease-1';
const stores: Array<ReturnType<typeof openDurableRunStore>> = [];
const roots: string[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('durable run state machine', () => {
  it('requires proof input and records a no-effect completion', () => {
    const initial = createDurableRun('run-1', leases, 3);
    const started = applyDurableEvent(initial, { kind: 'start', leaseToken: leases });
    const completed = applyDurableEvent(started.state, { kind: 'complete', leaseToken: leases, proofInput: 'requirements-v1' });
    expect(completed.state).toMatchObject({ phase: 'completed', revision: 2, authoritativeEffects: 0 });
    expect(completed.state.proofDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('rejects stale supervisors and illegal terminal transitions', () => {
    const initial = createDurableRun('run-1', leases, 3);
    expect(() => applyDurableEvent(initial, { kind: 'start', leaseToken: 'old-lease' })).toThrow('stale supervisor');
    const aborted = applyDurableEvent(initial, { kind: 'abort', leaseToken: leases }).state;
    expect(() => applyDurableEvent(aborted, { kind: 'start', leaseToken: leases })).toThrow('reserved');
  });

  it('commits state, event and outbox together', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-durable-run-'));
    roots.push(root);
    const store = openDurableRunStore(join(root, 'run.sqlite'), createDurableRun('run-1', leases, 3));
    stores.push(store);
    store.append('run-1', { kind: 'start', leaseToken: leases });
    expect(store.read('run-1')).toMatchObject({ phase: 'running', revision: 1 });
    expect(() => store.append('run-1', { kind: 'heartbeat', leaseToken: leases }, 'before-transaction')).toThrow('before transaction');
    expect(store.read('run-1')).toMatchObject({ phase: 'running', revision: 1 });
    expect(() => store.append('run-1', { kind: 'complete', leaseToken: leases, proofInput: 'requirements-v1' }, 'after-transaction')).toThrow('after transaction');
    expect(store.read('run-1')).toMatchObject({ phase: 'completed', revision: 2 });
    expect(store.append('run-1', { kind: 'complete', leaseToken: leases, proofInput: 'requirements-v1' }).state).toMatchObject({ phase: 'completed', revision: 2 });
    expect(store.evidence('run-1')).toMatchObject({ eventCount: 2, outboxCount: 2 });
  });

  it('refuses a worker success string as authoritative proof', () => {
    const initial = createDurableRun('run-1', leases, 3);
    const started = applyDurableEvent(initial, { kind: 'start', leaseToken: leases });
    expect(() => applyDurableEvent(started.state, {
      kind: 'complete', leaseToken: leases, proofInput: 'worker says success', workerSuccess: true,
    })).toThrow('worker success');
  });

  it('keeps the transition deterministic across 1,000 seeded resumes', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const initial = createDurableRun(`run-${seed}`, leases, 3);
      const result = applyDurableEvent(initial, { kind: 'start', leaseToken: leases });
      expect(result.state.revision).toBe(1);
      expect(result.eventDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });
});
