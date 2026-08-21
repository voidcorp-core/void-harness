import { describe, expect, it } from 'vitest';
import type { MissionPlan } from '../mission/plan.js';
import type { SpecialistId } from '../specialist/routing.js';
import { createSpecialistDispatch } from './dispatch.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const IDS = [
  'core:solution-architect',
  'core:security-engineer',
  'core:test-qa-engineer',
  'core:frontend-engineer',
] as const satisfies readonly SpecialistId[];

const PLAN = {
  specialists: IDS.map((specialistId, index) => ({
    specialistId,
    contractVersion: index + 1,
    state: 'applicable',
    stages: ['post-implementation'],
  })),
} as MissionPlan;

function dispatch(overrides: Partial<Parameters<typeof createSpecialistDispatch>[0]> = {}) {
  return createSpecialistDispatch({
    missionId: 'mis_0123456789abcdef0123456789abcdef',
    runtime: 'codex',
    plan: PLAN,
    action: {
      kind: 'invoke-specialists',
      specialistIds: IDS,
      stage: 'post-implementation',
      reviewRound: 2,
    },
    currentInputHashes: Object.fromEntries(IDS.map((id) => [id, HASH])),
    ...overrides,
  });
}

describe('createSpecialistDispatch', () => {
  it('turns every controller-requested specialist into one stable native handoff', () => {
    expect(dispatch()).toEqual(IDS.map((specialistId, index) => ({
      schemaVersion: 1,
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      runtime: 'codex',
      specialistId,
      agentName: specialistId.slice('core:'.length),
      contractVersion: index + 1,
      stage: 'post-implementation',
      reviewRound: 2,
      inputHash: HASH,
    })));
  });

  it.each([
    {
      name: 'duplicate controller IDs',
      overrides: {
        action: {
          kind: 'invoke-specialists' as const,
          specialistIds: [IDS[0], IDS[0]],
          stage: 'post-implementation' as const,
          reviewRound: 1,
        },
      },
    },
    {
      name: 'unresolved specialist',
      overrides: {
        action: {
          kind: 'invoke-specialists' as const,
          specialistIds: ['core:unknown-reviewer' as SpecialistId],
          stage: 'post-implementation' as const,
          reviewRound: 1,
        },
      },
    },
    {
      name: 'missing input hash',
      overrides: { currentInputHashes: {} },
    },
  ])('fails the whole action for $name', ({ overrides }) => {
    expect(() => dispatch(overrides)).toThrow('SPECIALIST_DISPATCH_INVALID');
  });

  it('keeps Claude and Codex envelopes equivalent except for the runtime field', () => {
    const codex = dispatch();
    const claude = dispatch({ runtime: 'claude' });

    expect(claude.map(({ runtime: _runtime, ...envelope }) => envelope)).toEqual(
      codex.map(({ runtime: _runtime, ...envelope }) => envelope),
    );
  });
});
