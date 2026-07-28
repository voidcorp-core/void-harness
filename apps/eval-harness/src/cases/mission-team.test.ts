import { serializeEvent, type CanonicalEvent } from '@voidcorp/mission-engine/events';
import { describe, expect, it } from 'vitest';
import {
  MISSION_TEAM_EVENTS,
  missionTeamGate,
  missionTeamScorer,
} from './mission-team.js';
import type { ConditionResult, EvalReport, RunOutcome } from '../types.js';

const HASH = `sha256:${'a'.repeat(64)}`;

function completion(
  seq: number,
  specialistId: string,
  summary: string,
  path: string,
  detail: string,
): CanonicalEvent {
  return {
    schemaVersion: 1,
    seq,
    eventId: `evt_mission_team_${String(seq).padStart(8, '0')}`,
    missionId: 'mis_mission_team_eval_0001',
    ts: '2026-07-26T12:00:00.000Z',
    source: 'runtime:codex',
    kind: 'specialist.completed',
    subject: specialistId,
    correlationId: 'mis_mission_team_eval_0001',
    payload: {
      stage: 'post-implementation',
      reviewRound: 1,
      inputHash: HASH,
      contextId: `ctx_${specialistId.slice(5)}`,
      completion: {
        schemaVersion: 1,
        specialistId,
        contractVersion: 2,
        completionId: `cmp_${specialistId.slice(5)}`,
        verdict: 'changes-requested',
        findings: [{
          id: `finding-${String(seq)}`,
          severity: 'high',
          summary,
          evidence: [{ path, line: 1, detail }],
          recommendation: `Correct ${summary}`,
        }],
        evidenceRequests: [],
        limitations: [],
      },
    },
  };
}

function outcome(transcript: string, events: readonly CanonicalEvent[] = []): RunOutcome {
  return {
    ok: true,
    costUsd: 0,
    files: events.length === 0
      ? {}
      : { [MISSION_TEAM_EVENTS]: `${events.map(serializeEvent).join('\n')}\n` },
    lastCommit: undefined,
    transcript,
  };
}

function condition(signalCounts: Readonly<Record<string, number>>): ConditionResult {
  return {
    scores: [1],
    meanScore: 1,
    okRuns: 1,
    costUsd: 0,
    signalCounts,
  };
}

function report(
  withSkill: Readonly<Record<string, number>>,
  withoutSkill: Readonly<Record<string, number>>,
): EvalReport {
  return {
    skill: 'ticket-runner',
    title: 'mission team',
    runsPerCondition: 1,
    withSkill: condition(withSkill),
    withoutSkill: condition(withoutSkill),
    delta: 0,
    verdict: 'no-signal',
    totalCostUsd: 0,
  };
}

describe('mission-team behavioral scorer', () => {
  it('requires all three concrete blockers and a non-green verdict', () => {
    const result = missionTeamScorer(outcome(
      'Verdict: blocked pending lead-writer correction.',
      [
        completion(
          1,
          'core:solution-architect',
          'Domain imports infrastructure across the dependency boundary.',
          'src/domain/order.ts',
          'The domain depends on the database adapter.',
        ),
        completion(
          2,
          'core:security-engineer',
          'Authorization bypass trusts untrusted request input.',
          'src/auth.ts',
          'claimedRole comes directly from request input.',
        ),
        completion(
          3,
          'core:test-qa-engineer',
          'The admin branch is untested.',
          'src/discount.test.ts',
          'The admin branch has a missing test.',
        ),
      ],
    ));

    expect(result.score).toBe(1);
    expect(result.signals).toEqual({
      securityBlocker: true,
      architectureBlocker: true,
      qaBlocker: true,
      noFalseGreen: true,
    });
  });

  it('scores a false green as zero even when it uses review vocabulary', () => {
    const result = missionTeamScorer(outcome(
      'Architecture, security, and QA reviewed. Verdict: verified; ready to merge.',
    ));

    expect(result.score).toBe(0);
    expect(result.signals).toMatchObject({ noFalseGreen: false });
  });

  it('does not accept specialist prose without replayable completion events', () => {
    const result = missionTeamScorer(outcome([
      'Authorization bypass found.',
      'Domain imports infrastructure.',
      'Admin branch is untested.',
      'Verdict: blocked.',
    ].join('\n')));

    expect(result.signals).toMatchObject({
      securityBlocker: false,
      architectureBlocker: false,
      qaBlocker: false,
    });
  });

  it('recognizes QA coverage language without requiring one exact phrase', () => {
    const qa = completion(
      1,
      'core:test-qa-engineer',
      'Regression coverage does not exercise the admin path.',
      'src/discount.test.ts',
      'Only the regular-user scenario is asserted.',
    );

    expect(missionTeamScorer(outcome('Verdict: blocked.', [qa])).signals).toMatchObject({
      qaBlocker: true,
    });
  });

  it('recognizes the exact architecture and QA language emitted by native reviews', () => {
    const events = [
      completion(
        1,
        'core:solution-architect',
        'The domain layer imports the infrastructure database module directly.',
        'src/domain/order.ts',
        'The dependency direction is inverted.',
      ),
      completion(
        2,
        'core:test-qa-engineer',
        'The admin discount branch has zero regression coverage.',
        'src/discount.test.ts',
        'Only the non-admin branch is asserted.',
      ),
    ];

    expect(missionTeamScorer(outcome('Verdict: blocked.', events)).signals).toMatchObject({
      architectureBlocker: true,
      qaBlocker: true,
    });
  });

  it('passes only when skill finds every blocker and neither arm turns green', () => {
    const complete = {
      securityBlocker: 1,
      architectureBlocker: 1,
      qaBlocker: 1,
      noFalseGreen: 1,
    };
    const baseline = { noFalseGreen: 1 };

    expect(missionTeamGate(report(complete, baseline))).toEqual({
      passed: true,
      falseGreens: 0,
      missingWithSkill: [],
    });
    expect(missionTeamGate(report(
      { ...complete, qaBlocker: 0 },
      { noFalseGreen: 0 },
    ))).toEqual({
      passed: false,
      falseGreens: 1,
      missingWithSkill: ['qaBlocker'],
    });
  });
});
