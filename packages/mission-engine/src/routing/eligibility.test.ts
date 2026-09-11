import { describe, expect, it } from 'vitest';
import {
  routeCandidates,
  type RouteCandidate,
  type RouteRequest,
} from './eligibility.js';

const HASH = `sha256:${'a'.repeat(64)}`;

const candidate = (id: string, over: Partial<RouteCandidate> = {}): RouteCandidate => ({
  id,
  capabilities: ['review'],
  schemas: ['mission-v2'],
  projectFacts: ['typescript'],
  packs: ['core'],
  runtimeFeatures: ['read-only'],
  permissions: ['read'],
  network: 'none',
  budgetMicroUsd: 0,
  compatibility: 'node-22',
  ...over,
});

const request = (over: Partial<RouteRequest> = {}): RouteRequest => ({
  inputHash: HASH,
  requiredCapabilities: ['review'],
  requiredSchemas: ['mission-v2'],
  requiredProjectFacts: ['typescript'],
  requiredPacks: ['core'],
  requiredRuntimeFeatures: ['read-only'],
  requiredPermissions: ['read'],
  requiredNetwork: 'none',
  maxBudgetMicroUsd: 0,
  compatibility: 'node-22',
  ...over,
});

describe('deterministic route eligibility', () => {
  it('refuses every failed predicate with typed reasons before ranking', () => {
    const result = routeCandidates([
      candidate('allowed'),
      candidate('wrong-capability', { capabilities: ['write'] }),
      candidate('wrong-network', { network: 'read-only' }),
      candidate('too-expensive', { budgetMicroUsd: 1 }),
    ], request({ maxBudgetMicroUsd: 0, requiredNetwork: 'none' }));

    expect(result.eligibleIds).toEqual(['allowed']);
    expect(result.rejections).toEqual([
      { candidateId: 'too-expensive', reasons: ['budget-exceeded'] },
      { candidateId: 'wrong-capability', reasons: ['missing-capability:review'] },
      { candidateId: 'wrong-network', reasons: ['network-too-permissive'] },
    ]);
  });

  it('applies allow and deny policy without letting policy add a route', () => {
    const result = routeCandidates([
      candidate('allowed'),
      candidate('denied'),
      candidate('outside-allow-list'),
    ], request({ allowIds: ['allowed'], denyIds: ['denied'] }));

    expect(result.eligibleIds).toEqual(['allowed']);
    expect(result.rejections).toEqual([
      { candidateId: 'denied', reasons: ['policy-denied', 'policy-not-allowed'] },
      { candidateId: 'outside-allow-list', reasons: ['policy-not-allowed'] },
    ]);
  });

  it('ranks only eligible candidates and falls back on invalid semantic output', () => {
    const candidates = [candidate('zulu'), candidate('alpha'), candidate('blocked', { capabilities: [] })];
    const ranked = routeCandidates(candidates, request(), () => ({ alpha: 0.2, zulu: 0.9 }));
    const fallback = routeCandidates(candidates, request(), () => ({ alpha: Number.NaN, zulu: 0.9 }));

    expect(ranked.orderedIds).toEqual(['zulu', 'alpha']);
    expect(ranked.proof.scores).toEqual([
      { candidateId: 'zulu', score: 0.9 },
      { candidateId: 'alpha', score: 0.2 },
    ]);
    expect(fallback.orderedIds).toEqual(['alpha', 'zulu']);
    expect(fallback.proof.fallback).toBe('invalid-semantic-output');
  });

  it('refuses malformed and ambiguous inputs before execution', () => {
    expect(() => routeCandidates([candidate('duplicate'), candidate('duplicate')], request()))
      .toThrow('ROUTING_INVALID: duplicate candidate id');
    expect(() => routeCandidates([candidate('valid')], request({ inputHash: 'bad' })))
      .toThrow('ROUTING_INVALID: inputHash');
    expect(routeCandidates([], request()).orderedIds).toEqual([]);
  });
});
