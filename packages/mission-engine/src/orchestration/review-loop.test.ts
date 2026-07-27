import { describe, expect, it } from 'vitest';
import type { CanonicalEvent } from '../events/types.js';
import { event } from '../test/events.js';
import {
  MVP_SPECIALIST_IDS,
  reduceReviewLoop,
  type MvpSpecialistId,
} from './review-loop.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

const INPUTS: Readonly<Record<MvpSpecialistId, string>> = {
  'core:solution-architect': HASH_A,
  'core:security-engineer': HASH_A,
  'core:test-qa-engineer': HASH_A,
};

function completion(
  specialistId: MvpSpecialistId,
  overrides: {
    readonly seq?: number;
    readonly inputHash?: string;
    readonly contextId?: string;
    readonly completionId?: string;
    readonly verdict?: 'pass' | 'changes-requested' | 'blocked' | 'degraded';
    readonly findings?: readonly Record<string, unknown>[];
    readonly evidenceRequests?: readonly string[];
    readonly limitations?: readonly string[];
    readonly reviewRound?: number;
    readonly contractVersion?: number;
  } = {},
): CanonicalEvent {
  const seq = overrides.seq ?? MVP_SPECIALIST_IDS.indexOf(specialistId) + 1;
  return event({
    seq,
    eventId: `evt_00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    source: 'runtime:codex',
    kind: 'specialist.completed',
    subject: specialistId,
    payload: {
      reviewRound: overrides.reviewRound ?? 1,
      inputHash: overrides.inputHash ?? HASH_A,
      contextId: overrides.contextId ?? `ctx_${specialistId.slice(5)}`,
      completion: {
        schemaVersion: 1,
        specialistId,
        contractVersion: overrides.contractVersion ?? 1,
        completionId: overrides.completionId ?? `cmp_${specialistId.slice(5)}`,
        verdict: overrides.verdict ?? 'pass',
        findings: overrides.findings ?? [],
        evidenceRequests: overrides.evidenceRequests ?? [],
        limitations: overrides.limitations ?? [],
      },
    },
  });
}

function review(events: readonly CanonicalEvent[], currentInputHashes = INPUTS) {
  return reduceReviewLoop({
    events,
    requiredSpecialists: MVP_SPECIALIST_IDS,
    currentInputHashes,
    maxRounds: 2,
  });
}

function finding(
  id: string,
  severity: 'critical' | 'high' | 'medium' | 'low',
  path: string,
  line: number,
): Record<string, unknown> {
  return {
    id,
    severity,
    summary: `${id} detected`,
    evidence: [{ path, line, detail: `evidence for ${id}` }],
    recommendation: `fix ${id}`,
  };
}

describe('MVP specialist review loop', () => {
  it('requires every applicable specialist completion before verdict', () => {
    const state = review([]);

    expect(state.status).toBe('awaiting-review');
    expect(state.specialistsToRun).toEqual(MVP_SPECIALIST_IDS);
    expect(state.readyForVerdict).toBe(false);
  });

  it('turns architecture, security, and QA findings into a bounded correction', () => {
    const state = review([
      completion('core:solution-architect', {
        findings: [finding('wrong-boundary', 'high', 'src/domain.ts', 2)],
        verdict: 'changes-requested',
      }),
      completion('core:security-engineer', {
        findings: [finding('auth-bypass', 'critical', 'src/auth.ts', 8)],
        verdict: 'blocked',
        limitations: ['The vulnerable branch prevents approval.'],
      }),
      completion('core:test-qa-engineer', {
        findings: [finding('untested-branch', 'high', 'src/feature.ts', 12)],
        verdict: 'changes-requested',
      }),
    ]);

    expect(state.status).toBe('correction-required');
    expect(state.findings.map((item) => item.summary)).toEqual([
      'auth-bypass detected',
      'untested-branch detected',
      'wrong-boundary detected',
    ]);
    expect(state.readyForVerdict).toBe(false);
  });

  it('reruns only specialists whose declared input hash changed', () => {
    const state = review(
      MVP_SPECIALIST_IDS.map((specialistId) => completion(specialistId)),
      {
        'core:solution-architect': HASH_A,
        'core:security-engineer': HASH_B,
        'core:test-qa-engineer': HASH_A,
      },
    );

    expect(state.status).toBe('awaiting-review');
    expect(state.staleSpecialists).toEqual(['core:security-engineer']);
    expect(state.specialistsToRun).toEqual(['core:security-engineer']);
  });

  it('becomes ready only after three fresh passing completions', () => {
    const state = review(
      MVP_SPECIALIST_IDS.map((specialistId) => completion(specialistId)),
    );

    expect(state.status).toBe('ready-for-verdict');
    expect(state.readyForVerdict).toBe(true);
    expect(state.specialistsToRun).toEqual([]);
  });

  it('blocks instead of turning green when a required specialist times out', () => {
    const failed = event({
      seq: 3,
      eventId: 'evt_00000000-0000-4000-8000-000000000003',
      kind: 'specialist.failed',
      subject: 'core:test-qa-engineer',
      payload: {
        reviewRound: 2,
        inputHash: HASH_A,
        reason: 'timeout',
      },
    });
    const state = review([
      completion('core:solution-architect', { reviewRound: 2 }),
      completion('core:security-engineer', { reviewRound: 2 }),
      failed,
    ]);

    expect(state.status).toBe('blocked');
    expect(state.missingSpecialists).toEqual(['core:test-qa-engineer']);
    expect(state.readyForVerdict).toBe(false);
  });

  it('advances a failed specialist retry and blocks after the bounded second attempt', () => {
    const failure = (seq: number, reviewRound: number) => event({
      seq,
      eventId: `evt_00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      kind: 'specialist.failed',
      subject: 'core:test-qa-engineer',
      payload: { reviewRound, inputHash: HASH_A, reason: 'timeout' },
    });
    const firstAttempt = [
      completion('core:solution-architect'),
      completion('core:security-engineer'),
      failure(3, 1),
    ];

    const retry = review(firstAttempt);
    expect(retry.status).toBe('awaiting-review');
    expect(retry.reviewRound).toBe(2);
    expect(retry.specialistsToRun).toEqual(['core:test-qa-engineer']);

    const exhausted = review([...firstAttempt, failure(4, 2)]);
    expect(exhausted.status).toBe('blocked');
    expect(exhausted.reviewRound).toBe(2);
  });

  it('degrades malformed, wrong-role, duplicate, and reused-context completions', () => {
    const duplicateId = 'cmp_duplicate';
    const reusedContext = 'ctx_reused';
    const state = review([
      completion('core:solution-architect', {
        completionId: duplicateId,
        contextId: reusedContext,
      }),
      completion('core:security-engineer', {
        completionId: duplicateId,
        contextId: reusedContext,
      }),
      event({
        seq: 3,
        eventId: 'evt_00000000-0000-4000-8000-000000000003',
        kind: 'specialist.completed',
        subject: 'core:unknown-reviewer',
        payload: {},
      }),
    ]);

    expect(state.status).toBe('degraded');
    expect(state.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'duplicate-completion',
        'reused-context',
        'wrong-specialist',
      ]),
    );
    expect(state.readyForVerdict).toBe(false);
  });

  it('deduplicates by concrete evidence rather than reviewer majority', () => {
    const shared = finding('shared-risk', 'medium', 'src/shared.ts', 7);
    const sharedWithDifferentTaxonomy = { ...shared, id: 'same-proof-different-id' };
    const distinct = finding('shared-risk', 'medium', 'src/other.ts', 7);
    const state = review([
      completion('core:solution-architect', {
        findings: [shared],
        verdict: 'changes-requested',
      }),
      completion('core:security-engineer', {
        findings: [sharedWithDifferentTaxonomy],
        verdict: 'changes-requested',
      }),
      completion('core:test-qa-engineer', {
        inputHash: HASH_C,
        findings: [distinct],
        verdict: 'changes-requested',
      }),
    ], {
      ...INPUTS,
      'core:test-qa-engineer': HASH_C,
    });

    expect(state.findings).toHaveLength(2);
    expect(state.findings[0]?.reportedBy).toHaveLength(2);
    expect(state.findings[1]?.reportedBy).toHaveLength(1);
  });

  it.each([
    {
      label: 'a Windows absolute evidence path',
      event: completion('core:solution-architect', {
        findings: [finding('absolute-path', 'high', 'C:\\repo\\src\\domain.ts', 1)],
        verdict: 'changes-requested',
      }),
    },
    {
      label: 'a critical finding without a blocked verdict',
      event: completion('core:security-engineer', {
        findings: [finding('critical-auth', 'critical', 'src/auth.ts', 1)],
        verdict: 'changes-requested',
      }),
    },
    {
      label: 'a degraded completion without a limitation',
      event: completion('core:test-qa-engineer', { verdict: 'degraded' }),
    },
    {
      label: 'a finding id outside the canonical lowercase kebab format',
      event: completion('core:solution-architect', {
        findings: [finding('ARCH-001', 'high', 'src/domain.ts', 1)],
        verdict: 'changes-requested',
      }),
    },
    {
      label: 'a completion from a different contract version',
      event: completion('core:solution-architect', { contractVersion: 2 }),
    },
  ])('degrades $label instead of accepting unsafe specialist output', ({ event }) => {
    const state = review([event]);

    expect(state.status).toBe('degraded');
    expect(state.issues).toEqual([
      expect.objectContaining({ code: 'invalid-completion' }),
    ]);
  });
});
