import type { CanonicalEvent } from '../events/types.js';
import { canonicalJsonHash } from '../evidence/canonical-json.js';

export const MVP_SPECIALIST_IDS = Object.freeze([
  'core:solution-architect',
  'core:security-engineer',
  'core:test-qa-engineer',
] as const);

export type MvpSpecialistId = typeof MVP_SPECIALIST_IDS[number];
export type ReviewLoopStatus =
  | 'awaiting-review'
  | 'correction-required'
  | 'ready-for-verdict'
  | 'blocked'
  | 'degraded';
export type ReviewFindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ReviewEvidence {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

export interface NormalizedReviewFinding {
  readonly findingId: string;
  readonly sourceId: string;
  readonly severity: ReviewFindingSeverity;
  readonly summary: string;
  readonly evidence: readonly ReviewEvidence[];
  readonly recommendation: string;
  readonly reportedBy: readonly MvpSpecialistId[];
}

export type ReviewLoopIssueCode =
  | 'invalid-completion'
  | 'wrong-specialist'
  | 'duplicate-completion'
  | 'reused-context';

export interface ReviewLoopIssue {
  readonly code: ReviewLoopIssueCode;
  readonly eventId: string;
  readonly detail: string;
}

export interface ReviewLoopInput {
  readonly events: readonly CanonicalEvent[];
  readonly requiredSpecialists: readonly MvpSpecialistId[];
  readonly currentInputHashes: Readonly<Record<MvpSpecialistId, string>>;
  readonly maxRounds: number;
}

export interface ReviewLoopState {
  readonly status: ReviewLoopStatus;
  readonly reviewRound: number;
  readonly missingSpecialists: readonly MvpSpecialistId[];
  readonly staleSpecialists: readonly MvpSpecialistId[];
  readonly specialistsToRun: readonly MvpSpecialistId[];
  readonly findings: readonly NormalizedReviewFinding[];
  readonly issues: readonly ReviewLoopIssue[];
  readonly readyForVerdict: boolean;
}

interface SpecialistFinding {
  readonly id: string;
  readonly severity: ReviewFindingSeverity;
  readonly summary: string;
  readonly evidence: readonly ReviewEvidence[];
  readonly recommendation: string;
}

interface SpecialistCompletion {
  readonly specialistId: MvpSpecialistId;
  readonly completionId: string;
  readonly verdict: 'pass' | 'changes-requested' | 'blocked' | 'degraded';
  readonly findings: readonly SpecialistFinding[];
  readonly evidenceRequests: readonly string[];
  readonly limitations: readonly string[];
}

interface CompletionEnvelope {
  readonly event: CanonicalEvent;
  readonly reviewRound: number;
  readonly inputHash: string;
  readonly contextId: string;
  readonly completion: SpecialistCompletion;
}

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMPLETION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const CONTEXT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const FINDING_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEVERITY_RANK: Readonly<Record<ReviewFindingSeverity, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

interface ReviewRecord extends Record<string, unknown> {
  readonly path?: unknown;
  readonly line?: unknown;
  readonly detail?: unknown;
  readonly id?: unknown;
  readonly severity?: unknown;
  readonly summary?: unknown;
  readonly evidence?: unknown;
  readonly recommendation?: unknown;
  readonly findings?: unknown;
  readonly schemaVersion?: unknown;
  readonly specialistId?: unknown;
  readonly contractVersion?: unknown;
  readonly completionId?: unknown;
  readonly verdict?: unknown;
  readonly evidenceRequests?: unknown;
  readonly limitations?: unknown;
  readonly reviewRound?: unknown;
  readonly completion?: unknown;
  readonly inputHash?: unknown;
  readonly contextId?: unknown;
}

function record(value: unknown): ReviewRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as ReviewRecord;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maximum
    && !value.includes('\0');
}

function specialistId(value: unknown): value is MvpSpecialistId {
  return typeof value === 'string'
    && MVP_SPECIALIST_IDS.some((candidate) => candidate === value);
}

function findingSeverity(value: unknown): value is ReviewFindingSeverity {
  return value === 'critical'
    || value === 'high'
    || value === 'medium'
    || value === 'low';
}

function parseEvidence(value: unknown): ReviewEvidence | undefined {
  const raw = record(value);
  if (
    raw === undefined
    || !boundedText(raw.path, 500)
    || raw.path.startsWith('/')
    || /^[A-Za-z]:/.test(raw.path)
    || raw.path.split(/[\\/]/).includes('..')
    || !Number.isSafeInteger(raw.line)
    || Number(raw.line) <= 0
    || Number(raw.line) > 10_000_000
    || !boundedText(raw.detail, 1_000)
  ) {
    return undefined;
  }
  return { path: raw.path, line: Number(raw.line), detail: raw.detail };
}

function parseFinding(value: unknown): SpecialistFinding | undefined {
  const raw = record(value);
  if (
    raw === undefined
    || !boundedText(raw.id, 80)
    || !FINDING_ID.test(raw.id)
    || !findingSeverity(raw.severity)
    || !boundedText(raw.summary, 500)
    || !Array.isArray(raw.evidence)
    || raw.evidence.length === 0
    || raw.evidence.length > 16
    || !boundedText(raw.recommendation, 1_000)
  ) {
    return undefined;
  }
  const evidence = raw.evidence.map(parseEvidence);
  if (evidence.some((item) => item === undefined)) return undefined;
  return {
    id: raw.id,
    severity: raw.severity,
    summary: raw.summary,
    evidence: evidence as readonly ReviewEvidence[],
    recommendation: raw.recommendation,
  };
}

function parseTextList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > 16) return undefined;
  return value.every((item) => boundedText(item, 1_000))
    ? value as readonly string[]
    : undefined;
}

function parseCompletion(value: unknown): SpecialistCompletion | undefined {
  const raw = record(value);
  const findingsRaw = raw?.findings;
  if (
    raw === undefined
    || raw.schemaVersion !== 1
    || !specialistId(raw.specialistId)
    || raw.contractVersion !== 1
    || typeof raw.completionId !== 'string'
    || !COMPLETION_ID.test(raw.completionId)
    || !['pass', 'changes-requested', 'blocked', 'degraded'].includes(
      String(raw.verdict),
    )
    || !Array.isArray(findingsRaw)
    || findingsRaw.length > 32
  ) {
    return undefined;
  }
  const findings = findingsRaw.map(parseFinding);
  const evidenceRequests = parseTextList(raw.evidenceRequests);
  const limitations = parseTextList(raw.limitations);
  if (
    findings.some((item) => item === undefined)
    || evidenceRequests === undefined
    || limitations === undefined
    || (
      (raw.verdict === 'blocked' || raw.verdict === 'degraded')
      && limitations.length === 0
    )
    || (
      findings.some((finding) => finding?.severity === 'critical')
      && raw.verdict !== 'blocked'
    )
  ) {
    return undefined;
  }
  return {
    specialistId: raw.specialistId,
    completionId: raw.completionId,
    verdict: raw.verdict as SpecialistCompletion['verdict'],
    findings: findings as readonly SpecialistFinding[],
    evidenceRequests,
    limitations,
  };
}

function parseEnvelope(event: CanonicalEvent): CompletionEnvelope | undefined {
  const payload = record(event.payload);
  const reviewRound = payload?.reviewRound;
  const completion = parseCompletion(payload?.completion);
  if (
    payload === undefined
    || !Number.isSafeInteger(reviewRound)
    || Number(reviewRound) < 1
    || Number(reviewRound) > 8
    || typeof payload.inputHash !== 'string'
    || !SHA256.test(payload.inputHash)
    || typeof payload.contextId !== 'string'
    || !CONTEXT_ID.test(payload.contextId)
    || completion === undefined
  ) {
    return undefined;
  }
  return {
    event,
    reviewRound: Number(reviewRound),
    inputHash: payload.inputHash,
    contextId: payload.contextId,
    completion,
  };
}

function collectCompletions(events: readonly CanonicalEvent[]): {
  readonly accepted: readonly CompletionEnvelope[];
  readonly issues: readonly ReviewLoopIssue[];
  readonly highestRound: number;
} {
  const accepted: CompletionEnvelope[] = [];
  const issues: ReviewLoopIssue[] = [];
  const completionIds = new Set<string>();
  const contextIds = new Set<string>();
  let highestRound = 0;
  for (const event of events) {
    const payload = record(event.payload);
    if (event.kind === 'specialist.failed') {
      const round = payload?.reviewRound;
      if (Number.isSafeInteger(round)) highestRound = Math.max(highestRound, Number(round));
      continue;
    }
    if (event.kind !== 'specialist.completed') continue;
    const envelope = parseEnvelope(event);
    if (envelope === undefined) {
      const code = specialistId(event.subject) ? 'invalid-completion' : 'wrong-specialist';
      issues.push({ code, eventId: event.eventId, detail: 'completion envelope is invalid' });
      continue;
    }
    highestRound = Math.max(highestRound, envelope.reviewRound);
    if (envelope.completion.specialistId !== event.subject) {
      issues.push({
        code: 'wrong-specialist',
        eventId: event.eventId,
        detail: 'event subject does not match completion specialist',
      });
      continue;
    }
    const duplicateCompletion = completionIds.has(envelope.completion.completionId);
    const reusedContext = contextIds.has(envelope.contextId);
    if (duplicateCompletion) {
      issues.push({
        code: 'duplicate-completion',
        eventId: event.eventId,
        detail: envelope.completion.completionId,
      });
    }
    if (reusedContext) {
      issues.push({ code: 'reused-context', eventId: event.eventId, detail: envelope.contextId });
    }
    if (duplicateCompletion || reusedContext) {
      continue;
    }
    completionIds.add(envelope.completion.completionId);
    contextIds.add(envelope.contextId);
    accepted.push(envelope);
  }
  return { accepted, issues, highestRound };
}

function latestBySpecialist(
  completions: readonly CompletionEnvelope[],
): ReadonlyMap<MvpSpecialistId, CompletionEnvelope> {
  const latest = new Map<MvpSpecialistId, CompletionEnvelope>();
  for (const completion of completions) {
    const current = latest.get(completion.completion.specialistId);
    if (current === undefined || completion.event.seq > current.event.seq) {
      latest.set(completion.completion.specialistId, completion);
    }
  }
  return latest;
}

function mergeFindings(
  completions: readonly CompletionEnvelope[],
): readonly NormalizedReviewFinding[] {
  const findings = new Map<string, NormalizedReviewFinding>();
  for (const envelope of completions) {
    for (const finding of envelope.completion.findings) {
      const proofKey = canonicalJsonHash({ evidence: finding.evidence });
      const current = findings.get(proofKey);
      if (current === undefined) {
        findings.set(proofKey, {
          findingId: `fnd_${proofKey.slice('sha256:'.length, 29)}`,
          sourceId: finding.id,
          severity: finding.severity,
          summary: finding.summary,
          evidence: finding.evidence,
          recommendation: finding.recommendation,
          reportedBy: [envelope.completion.specialistId],
        });
        continue;
      }
      findings.set(proofKey, {
        ...current,
        severity: SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity]
          ? finding.severity
          : current.severity,
        reportedBy: [...new Set([
          ...current.reportedBy,
          envelope.completion.specialistId,
        ])].sort(),
      });
    }
  }
  return [...findings.values()].sort((left, right) =>
    left.summary.localeCompare(right.summary)
  );
}

function decideStatus(input: {
  readonly issues: readonly ReviewLoopIssue[];
  readonly current: readonly CompletionEnvelope[];
  readonly missing: readonly MvpSpecialistId[];
  readonly stale: readonly MvpSpecialistId[];
  readonly findings: readonly NormalizedReviewFinding[];
  readonly attemptedRound: number;
  readonly maxRounds: number;
}): ReviewLoopStatus {
  if (input.issues.length > 0) return 'degraded';
  if (input.current.some((item) => item.completion.verdict === 'degraded')) {
    return 'degraded';
  }
  if (input.missing.length > 0 || input.stale.length > 0) {
    return input.attemptedRound >= input.maxRounds ? 'blocked' : 'awaiting-review';
  }
  const requestsEvidence = input.current.some((item) =>
    item.completion.evidenceRequests.length > 0
  );
  const requestsChanges = input.current.some((item) =>
    item.completion.verdict === 'changes-requested'
    || item.completion.verdict === 'blocked'
  );
  if (input.findings.length > 0 || requestsEvidence || requestsChanges) {
    return input.attemptedRound >= input.maxRounds ? 'blocked' : 'correction-required';
  }
  return 'ready-for-verdict';
}

export function reduceReviewLoop(input: ReviewLoopInput): ReviewLoopState {
  if (!Number.isSafeInteger(input.maxRounds) || input.maxRounds < 1 || input.maxRounds > 8) {
    throw new Error('REVIEW_LOOP_INVALID: maxRounds must be an integer in [1, 8]');
  }
  const collected = collectCompletions(input.events);
  const latest = latestBySpecialist(collected.accepted);
  const missing = input.requiredSpecialists.filter((id) => !latest.has(id));
  const stale = input.requiredSpecialists.filter((id) => {
    const completion = latest.get(id);
    return completion !== undefined && completion.inputHash !== input.currentInputHashes[id];
  });
  const current = input.requiredSpecialists.flatMap((id) => {
    const completion = latest.get(id);
    return completion === undefined || stale.includes(id) ? [] : [completion];
  });
  const findings = mergeFindings(current);
  const status = decideStatus({
    issues: collected.issues,
    current,
    missing,
    stale,
    findings,
    attemptedRound: collected.highestRound,
    maxRounds: input.maxRounds,
  });
  const reviewRound = status === 'awaiting-review'
    ? Math.min(input.maxRounds, Math.max(1, collected.highestRound + 1))
    : Math.max(1, collected.highestRound);
  return {
    status,
    reviewRound,
    missingSpecialists: missing,
    staleSpecialists: stale,
    specialistsToRun: input.requiredSpecialists.filter((id) =>
      missing.includes(id) || stale.includes(id)
    ),
    findings,
    issues: collected.issues,
    readyForVerdict: status === 'ready-for-verdict',
  };
}
