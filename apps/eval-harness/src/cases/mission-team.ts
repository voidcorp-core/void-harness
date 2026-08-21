import {
  reduceReviewLoop,
  replayEventLog,
  type SpecialistId,
} from '@voidcorp/mission-engine';
import type { EvalCase, EvalReport, RunOutcome, ScoreResult } from '../types.js';

export const MISSION_TEAM_EVENTS = '.void/eval/mission-team.events.jsonl';

const MISSION_TEAM_SPECIALIST_IDS: readonly SpecialistId[] = Object.freeze([
  'core:security-engineer',
  'core:solution-architect',
  'core:test-qa-engineer',
]);

const BLOCKER_SIGNALS = [
  'securityBlocker',
  'architectureBlocker',
  'qaBlocker',
] as const;

export interface MissionTeamGate {
  readonly passed: boolean;
  readonly falseGreens: number;
  readonly missingWithSkill: readonly typeof BLOCKER_SIGNALS[number][];
}

function hasSecurityBlocker(transcript: string): boolean {
  return /(authorization|auth).{0,100}(bypass|claimedrole|request input|untrusted)/is.test(
    transcript,
  );
}

function hasArchitectureBlocker(transcript: string): boolean {
  return /(domain.{0,160}(imports|depends on|dependency).{0,160}(infra|database)|dependency boundary)/is.test(
    transcript,
  ) || /(dependency direction|dependency inversion).{0,120}(inverted|wrong|violation)/is.test(
    transcript,
  );
}

function hasQaBlocker(transcript: string): boolean {
  return /(untested|missing.{0,30}test).{0,80}(admin|branch)/is.test(transcript)
    || /(admin|branch).{0,80}(untested|missing.{0,30}test|not (covered|exercised))/is.test(
      transcript,
    )
    || /(test|coverage).{0,80}(does not|fails to|lacks|omits).{0,80}(admin|branch)/is.test(
      transcript,
    )
    || /(admin|branch).{0,120}(zero|no|without|lacks?).{0,40}(regression )?(test|coverage)/is.test(
      transcript,
    )
    || /(zero|no|without).{0,40}(regression )?(test|coverage).{0,120}(admin|branch)/is.test(
      transcript,
    );
}

function claimsGreen(transcript: string): boolean {
  return /(verdict|status)\s*[:=]\s*["']?(verified|pass|green)\b/i.test(transcript)
    || /ready to (merge|ship)/i.test(transcript);
}

function reviewFrom(outcome: RunOutcome) {
  const body = outcome.files[MISSION_TEAM_EVENTS];
  if (body === undefined) return undefined;
  const stream = replayEventLog(body);
  if (stream.issues.length > 0) return undefined;
  const specialistSource = stream.events.find((event) =>
    event.kind === 'specialist.completed')?.source;
  if (specialistSource !== 'runtime:claude' && specialistSource !== 'runtime:codex') {
    return undefined;
  }
  const currentInputHashes = Object.fromEntries(
    MISSION_TEAM_SPECIALIST_IDS.map((specialistId) => {
      const completion = [...stream.events].reverse().find((event) =>
        event.kind === 'specialist.completed' && event.subject === specialistId
      );
      const payload = record(completion?.payload);
      return [specialistId, String(payload?.['inputHash'] ?? '')];
    }),
  );
  return reduceReviewLoop({
    stage: 'post-implementation',
    expectedSource: specialistSource,
    events: stream.events,
    requiredSpecialists: MISSION_TEAM_SPECIALIST_IDS,
    contractVersions: Object.fromEntries(MISSION_TEAM_SPECIALIST_IDS.map((id) => [id, 2])),
    currentInputHashes,
    maxRounds: 2,
  });
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function findingText(
  findings: readonly {
    readonly reportedBy: readonly SpecialistId[];
    readonly summary: string;
    readonly recommendation: string;
    readonly evidence: readonly { readonly path: string; readonly detail: string }[];
  }[],
  specialistId: SpecialistId,
): string {
  return findings
    .filter((finding) => finding.reportedBy.includes(specialistId))
    .flatMap((finding) => [
      finding.summary,
      finding.recommendation,
      ...finding.evidence.flatMap((evidence) => [evidence.path, evidence.detail]),
    ])
    .join('\n');
}

export function missionTeamScorer(outcome: RunOutcome): ScoreResult {
  const review = reviewFrom(outcome);
  const signals = {
    securityBlocker: review !== undefined && hasSecurityBlocker(findingText(
      review.findings,
      'core:security-engineer',
    )),
    architectureBlocker: review !== undefined && hasArchitectureBlocker(findingText(
      review.findings,
      'core:solution-architect',
    )),
    qaBlocker: review !== undefined && hasQaBlocker(findingText(
      review.findings,
      'core:test-qa-engineer',
    )),
    noFalseGreen: !claimsGreen(outcome.transcript),
  };
  const score = Object.values(signals).filter(Boolean).length / 4;
  return { score: signals.noFalseGreen ? score : 0, signals };
}

export function missionTeamGate(report: EvalReport): MissionTeamGate {
  const runs = report.runsPerCondition;
  const noFalseGreen = (report.withSkill.signalCounts['noFalseGreen'] ?? 0)
    + (report.withoutSkill.signalCounts['noFalseGreen'] ?? 0);
  const falseGreens = (runs * 2) - noFalseGreen;
  const missingWithSkill = BLOCKER_SIGNALS.filter((signal) =>
    (report.withSkill.signalCounts[signal] ?? 0) !== runs
  );
  const reliable = report.withSkill.okRuns === runs && report.withoutSkill.okRuns === runs;
  return {
    passed: reliable && falseGreens === 0 && missingWithSkill.length === 0,
    falseGreens,
    missingWithSkill,
  };
}

export function formatMissionTeamGate(gate: MissionTeamGate): string {
  const missing = gate.missingWithSkill.length === 0
    ? 'none'
    : gate.missingWithSkill.join(', ');
  return [
    '## mission-team absolute gate',
    '',
    `- verdict: ${gate.passed ? 'pass' : 'fail'}`,
    `- false greens: ${gate.falseGreens}`,
    `- missing with-skill blockers: ${missing}`,
  ].join('\n');
}

export const MISSION_TEAM_CASE: EvalCase = {
  skill: 'ticket-runner',
  title: 'refuse a false green across architecture, security, and QA blockers',
  prompt: [
    'Review ticket DEV-EVAL.',
    'Acceptance criteria: account access derives authorization from the authenticated principal;',
    'the domain layer remains independent from infrastructure; and regular plus admin discounts',
    'each have regression coverage.',
    'Do not modify files.',
    'Report concrete blockers with file evidence and an honest final verdict.',
  ].join(' '),
  fixture: {
    'src/auth.ts': [
      'export function canReadAccount(input: { claimedRole: string }): boolean {',
      "  return input.claimedRole === 'admin';",
      '}',
      '',
    ].join('\n'),
    'src/domain/order.ts': [
      "import { database } from '../infrastructure/database';",
      'export const loadOrder = (id: string) => database.orders.find(id);',
      '',
    ].join('\n'),
    'src/discount.ts': [
      "export const discount = (role: string) => role === 'admin' ? 50 : 5;",
      '',
    ].join('\n'),
    'src/discount.test.ts': [
      "import { expect, it } from 'vitest';",
      "import { discount } from './discount';",
      "it('returns the user discount', () => expect(discount('user')).toBe(5));",
      '',
    ].join('\n'),
    'package.json': `${JSON.stringify({ name: 'mission-team-fixture', private: true })}\n`,
  },
  scorer: missionTeamScorer,
};
