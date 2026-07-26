import { describe, expect, it } from 'vitest';
import { replayEventLog, serializeEvent } from '../events/index.js';
import type { CanonicalEvent } from '../events/types.js';
import type { MissionPlan } from '../mission/plan.js';
import { event } from '../test/events.js';
import { DIFF_A, evidenceDraft } from '../test/evidence.js';
import { sealEvidence } from '../evidence/schema.js';
import {
  MVP_SPECIALIST_IDS,
  type MvpSpecialistId,
} from './review-loop.js';
import { orchestrateMissionTeam } from './controller.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const INPUTS: Readonly<Record<MvpSpecialistId, string>> = {
  'core:solution-architect': HASH,
  'core:security-engineer': HASH,
  'core:test-qa-engineer': HASH,
};

const PLAN = {
  planHash: `sha256:${'f'.repeat(64)}`,
  applicability: [
    { pass: 'architecture', state: 'pending' },
    { pass: 'security', state: 'pending' },
    { pass: 'qa', state: 'pending' },
  ],
} as MissionPlan;

function started(): CanonicalEvent {
  return event({
    kind: 'mission.started',
    subject: 'mission',
    payload: {
      title: 'Review a vulnerable change',
      mode: 'team',
      planHash: PLAN.planHash,
      leadWriterId: 'writer:primary',
      runtime: 'codex',
    },
  });
}

function writer(seq = 2, writerId = 'writer:primary'): CanonicalEvent {
  return event({
    seq,
    eventId: `evt_00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    kind: 'lead-writer.completed',
    subject: writerId,
    payload: { writerId, planHash: PLAN.planHash },
  });
}

function completion(
  specialistId: MvpSpecialistId,
  seq: number,
  verdict: 'pass' | 'changes-requested' = 'pass',
): CanonicalEvent {
  return event({
    seq,
    eventId: `evt_00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    kind: 'specialist.completed',
    subject: specialistId,
    payload: {
      reviewRound: 1,
      inputHash: HASH,
      contextId: `ctx_${specialistId.slice(5)}`,
      completion: {
        schemaVersion: 1,
        specialistId,
        contractVersion: 1,
        completionId: `cmp_${specialistId.slice(5)}`,
        verdict,
        findings: verdict === 'pass' ? [] : [{
          id: 'auth-bypass',
          severity: 'high',
          summary: 'Authorization can be bypassed.',
          evidence: [{ path: 'src/auth.ts', line: 8, detail: 'Role comes from input.' }],
          recommendation: 'Derive authorization from the authenticated principal.',
        }],
        evidenceRequests: [],
        limitations: [],
      },
    },
  });
}

function stream(events: readonly CanonicalEvent[]) {
  return replayEventLog(`${events.map(serializeEvent).join('\n')}\n`);
}

function decide(events: readonly CanonicalEvent[]) {
  return orchestrateMissionTeam({
    plan: PLAN,
    stream: stream(events),
    evidenceContext: { dependencies: { 'git:working-tree': DIFF_A } },
    currentInputHashes: INPUTS,
    maxReviewRounds: 2,
  });
}

describe('mission team controller', () => {
  it('keeps one lead writer as the only implementation owner', () => {
    const beforeImplementation = decide([started()]);

    expect(beforeImplementation.phase).toBe('implementation');
    expect(beforeImplementation.action).toEqual({
      kind: 'run-lead-writer',
      writerId: 'writer:primary',
    });

    const violation = decide([started(), writer(), writer(3, 'writer:other')]);
    expect(violation.phase).toBe('degraded');
    expect(violation.action.kind).toBe('stop');
  });

  it('invokes all three fresh-context reviewers after implementation', () => {
    const decision = decide([started(), writer()]);

    expect(decision.phase).toBe('review');
    expect(decision.action).toMatchObject({
      kind: 'invoke-specialists',
      specialistIds: MVP_SPECIALIST_IDS,
      reviewRound: 1,
    });
  });

  it('routes structured findings back to the same writer', () => {
    const decision = decide([
      started(),
      writer(),
      completion('core:solution-architect', 3),
      completion('core:security-engineer', 4, 'changes-requested'),
      completion('core:test-qa-engineer', 5),
    ]);

    expect(decision.phase).toBe('correction');
    expect(decision.action).toMatchObject({
      kind: 'run-correction',
      writerId: 'writer:primary',
    });
    expect(decision.review.findings[0]?.summary).toContain('Authorization');
  });

  it('cannot verify when one required specialist completion is absent', () => {
    const proof = sealEvidence(evidenceDraft());
    const decision = decide([
      started(),
      writer(),
      completion('core:solution-architect', 3),
      completion('core:security-engineer', 4),
      event({
        seq: 5,
        eventId: 'evt_00000000-0000-4000-8000-000000000005',
        kind: 'evidence.recorded',
        subject: proof.evidenceId,
        payload: { evidence: proof },
      }),
    ]);

    expect(decision.phase).toBe('review');
    expect(decision.verdict.status).not.toBe('verified');
    expect(decision.review.missingSpecialists).toEqual(['core:test-qa-engineer']);
  });

  it('verifies only with complete reviews and fresh command proof', () => {
    const proof = sealEvidence(evidenceDraft());
    const reviews = MVP_SPECIALIST_IDS.map((specialistId, index) =>
      completion(specialistId, index + 3)
    );
    const decision = decide([
      started(),
      writer(),
      ...reviews,
      event({
        seq: 6,
        eventId: 'evt_00000000-0000-4000-8000-000000000006',
        kind: 'evidence.recorded',
        subject: proof.evidenceId,
        payload: { evidence: proof },
      }),
    ]);

    expect(decision.phase).toBe('verified');
    expect(decision.action).toEqual({ kind: 'complete' });
    expect(decision.verdict.status).toBe('verified');
  });
});
