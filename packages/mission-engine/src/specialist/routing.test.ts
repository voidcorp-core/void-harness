import { describe, expect, it } from 'vitest';
import type { ProfileRoutingDecision } from '../profile/routing.js';
import { routeSpecialists, type SpecialistRoutingContract } from './routing.js';

const HASH = `sha256:${'a'.repeat(64)}`;

function contract(
  name: string,
  predicates: readonly string[],
): SpecialistRoutingContract {
  return {
    id: `core:${name}`,
    version: 1,
    name,
    stages: ['post-implementation'],
    appliesWhen: { any: predicates },
  };
}

function profile(
  name: string,
  state: ProfileRoutingDecision['state'],
  patterns: readonly string[] = [],
): ProfileRoutingDecision {
  return {
    profileId: `core:${name}`,
    profileVersion: 1,
    state,
    activePatternIds: patterns,
    reasons: state === 'degraded' ? ['source-review-required'] : [],
    sourceReviewRequired: state === 'degraded',
    proof: {
      predicateId: `profile:${name}:detectors`,
      inputs: ['files:1'],
      inputHash: HASH,
    },
  };
}

describe('routeSpecialists', () => {
  it('evaluates every contract with deterministic proof', () => {
    const decisions = routeSpecialists([
      contract('data-migration-engineer', ['migration', 'profile-sql']),
      contract('frontend-engineer', ['ux-ui', 'profile-react']),
      contract('pdf-specialist', ['pdf']),
    ], {
      signals: new Set(['ux-ui']),
      profiles: [profile('react', 'applicable', ['component-change'])],
      contextStatus: 'complete',
      inputHash: HASH,
    });

    expect(decisions.map((decision) => [decision.specialistId, decision.state])).toEqual([
      ['core:data-migration-engineer', 'not-applicable'],
      ['core:frontend-engineer', 'applicable'],
      ['core:pdf-specialist', 'not-applicable'],
    ]);
    expect(decisions[0]?.proof).toMatchObject({
      predicateId: 'specialist:data-migration-engineer:applies-when',
      inputs: ['ticket', 'diff.files', 'stack.technologies', 'profiles'],
      inputHash: HASH,
      classifierVersion: expect.any(String),
    });
  });

  it('uses applicable profile and pattern evidence without activating data work for CSS', () => {
    const decisions = routeSpecialists([
      contract('data-migration-engineer', ['migration', 'profile-sql']),
      contract('frontend-engineer', ['profile-react']),
    ], {
      signals: new Set(['ux-ui', 'accessibility']),
      profiles: [profile('react', 'applicable', ['visual-change'])],
      contextStatus: 'complete',
      inputHash: HASH,
    });

    expect(decisions).toMatchObject([
      { specialistId: 'core:data-migration-engineer', state: 'not-applicable' },
      {
        specialistId: 'core:frontend-engineer',
        state: 'applicable',
        proof: { inputs: ['profile-react'] },
      },
    ]);
  });

  it('fails closed when context or matching profile evidence is degraded', () => {
    const unknown = routeSpecialists([
      contract('api-integration-engineer', ['architecture', 'profile-node-server']),
    ], {
      signals: new Set(),
      profiles: [],
      contextStatus: 'degraded',
      inputHash: HASH,
    });
    const staleProfile = routeSpecialists([
      contract('api-integration-engineer', ['profile-node-server']),
    ], {
      signals: new Set(),
      profiles: [profile('node-server', 'degraded', ['request-boundary'])],
      contextStatus: 'complete',
      inputHash: HASH,
    });

    expect(unknown[0]).toMatchObject({
      state: 'degraded',
      proof: { reason: expect.stringContaining('incomplete') },
    });
    expect(staleProfile[0]).toMatchObject({
      state: 'degraded',
      proof: { inputs: ['profile-node-server'] },
    });
    const unrelatedStaleProfile = routeSpecialists([
      contract('frontend-engineer', ['profile-react']),
    ], {
      signals: new Set(),
      profiles: [profile('sql', 'degraded', ['schema-migration'])],
      contextStatus: 'complete',
      inputHash: HASH,
    });
    expect(unrelatedStaleProfile[0]?.state).toBe('not-applicable');
  });

  it('rejects duplicate and malformed catalog entries', () => {
    const duplicate = contract('frontend-engineer', ['ux-ui']);
    const input = {
      signals: new Set<string>(),
      profiles: [] as const,
      contextStatus: 'complete' as const,
      inputHash: HASH,
    };
    expect(() => routeSpecialists([duplicate, duplicate], input)).toThrow(/duplicate specialist id/);
    expect(() => routeSpecialists([{
      ...duplicate,
      id: 'other:frontend-engineer',
    }], input)).toThrow(/SPECIALIST_ROUTING_INVALID/);
    expect(() => routeSpecialists([], input)).toThrow(/catalog must contain/);
    expect(() => routeSpecialists([null] as never, input)).toThrow(/malformed contract/);
    expect(() => routeSpecialists([{
      id: 'core:frontend-engineer',
      version: 1,
      name: 'frontend-engineer',
    }] as never, input)).toThrow(/malformed contract/);
  });
});
