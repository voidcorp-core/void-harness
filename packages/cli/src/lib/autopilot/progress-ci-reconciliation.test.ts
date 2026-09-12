import { describe, expect, it } from 'vitest';
import {
  type CiCheckObservation,
  createProgressEffect,
  type ProgressObservation,
  reconcileProgressEffect,
  reconcileRequiredChecks,
} from './progress-ci-reconciliation.js';

const intent = createProgressEffect({ runId: 'run-1', unitId: 'DEV-706', revision: 3, operation: 'move-to-review', payload: 'sha-1', kind: 'machine-reconciled' });
const observed = (revision = 3): ProgressObservation => ({ kind: 'applied', effectId: intent.effectId, revision });
const check = (over: Partial<CiCheckObservation> = {}): CiCheckObservation => ({ name: 'validate', required: true, conclusion: 'success', sha: 'a'.repeat(40), url: 'https://ci.example/run/1', ...over });

describe('progress effect reconciliation', () => {
  it('canonicalizes a stable effect identity and accepts an exact provider receipt', () => {
    const reordered = createProgressEffect({ runId: 'run-1', unitId: 'DEV-706', revision: 3, operation: 'move-to-review', payload: 'sha-1', kind: 'machine-reconciled' });
    expect(reordered.effectId).toBe(intent.effectId);
    expect(reconcileProgressEffect(intent, observed())).toEqual({ kind: 'applied', revision: 3 });
  });

  it.each([
    ['duplicate', { kind: 'duplicate', effectId: intent.effectId, revision: 3 }],
    ['provider read after timeout', { kind: 'applied', effectId: intent.effectId, revision: 3 }],
  ] as const)('treats %s as one applied effect', (_label, observation) => {
    expect(reconcileProgressEffect(intent, observation)).toEqual({ kind: 'applied', revision: 3 });
  });

  it('retries a missing machine-reconciled effect but sends ambiguous writes to a human wait', () => {
    expect(reconcileProgressEffect(intent, { kind: 'not-found' })).toEqual({ kind: 'retry-read' });
    expect(reconcileProgressEffect(intent, { kind: 'ambiguous', detail: 'timeout after provider accepted the request' })).toEqual({ kind: 'human-wait', detail: 'timeout after provider accepted the request' });
    const nonIdempotent = createProgressEffect({ ...intent, kind: 'non-idempotent' });
    expect(reconcileProgressEffect(nonIdempotent, { kind: 'not-found' })).toEqual({ kind: 'human-wait', detail: 'effect outcome is unknown' });
  });

  it('keeps rate limits bounded and permanent refusals terminal', () => {
    expect(reconcileProgressEffect(intent, { kind: 'rate-limited', retryAfterMs: 2500 })).toEqual({ kind: 'retry-after', retryAfterMs: 2500 });
    expect(reconcileProgressEffect(intent, { kind: 'refused', detail: 'permission denied' })).toEqual({ kind: 'blocked', detail: 'permission denied' });
  });

  it('refuses stale progress receipts', () => {
    expect(reconcileProgressEffect(intent, observed(2))).toEqual({ kind: 'retry-read' });
  });
});

describe('exact-SHA CI reconciliation', () => {
  it('accepts every required successful check on the exact integration SHA', () => {
    expect(reconcileRequiredChecks(['validate', 'test'], [check(), check({ name: 'test' })], 'a'.repeat(40))).toEqual({ kind: 'accepted', checks: ['validate', 'test'] });
  });

  it.each([
    ['wrong SHA', [check({ sha: 'b'.repeat(40) })], /exact SHA/i],
    ['missing required check', [], /missing/i],
    ['failed required check', [check({ conclusion: 'failure' })], /settled/i],
    ['unknown check result', [check({ conclusion: 'pending' })], /settled/i],
  ] as const)('fails closed for %s', (_label, observations, message) => {
    expect(() => reconcileRequiredChecks(['validate'], observations, 'a'.repeat(40))).toThrow(message);
  });

  it('ignores optional checks while still refusing an untrusted required check', () => {
    expect(reconcileRequiredChecks(['validate'], [check({ required: false, name: 'lint', conclusion: 'failure' }), check()], 'a'.repeat(40))).toEqual({ kind: 'accepted', checks: ['validate'] });
  });
});
