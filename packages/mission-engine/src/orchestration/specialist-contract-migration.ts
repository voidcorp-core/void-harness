import { parseEvidence } from '../evidence/schema.js';
import { canonicalJsonHash } from '../evidence/canonical-json.js';
import { replayEventLog } from '../events/reducer.js';
import { serializeEvent } from '../events/schema.js';
import { projectMissionLifecycle } from './mission-lifecycle.js';
import { validatedRecoveredReviewEvents } from './mission-recovery.js';
import { reduceReviewLoop } from './review-loop.js';
import { reduceEvidenceObligations } from '../specialist/evidence-obligations.js';
import type { EventStreamState } from '../events/reducer.js';
import type { CanonicalEvent } from '../events/types.js';
import type { MissionSpecialistPlan } from './controller.js';

export interface SpecialistContractMigrationRequest {
  readonly schemaVersion: 1;
  readonly expectedJournalHash: string;
  readonly expectedEpisodeId: string;
  readonly migrationId: string;
}
export interface SpecialistContractMigrationDeclaration {
  readonly id: string;
  readonly specialistId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly fromContractSha256: string;
  readonly toContractSha256: string;
  readonly fromContractPath: string;
  readonly policy: string;
}
export interface SpecialistContractMigrationObservation {
  readonly declaration: SpecialistContractMigrationDeclaration;
  readonly observedFromContractSha256: string;
  readonly observedToContractSha256: string;
  readonly nativeAgentSha256: string;
  readonly nativeContractVersion: number;
  readonly reviewSubjectHash: string;
  readonly targetInputHash: string;
  readonly plan: MissionSpecialistPlan;
  readonly currentInputHashes: Readonly<Record<string, string>>;
  readonly maxRounds: number;
  readonly evidenceDependencies?: Readonly<Record<string, string>>;
  readonly expectedSource: 'runtime:codex' | 'runtime:claude';
}
export interface SpecialistContractMigrationReceipt {
  readonly schemaVersion: 1;
  readonly request: SpecialistContractMigrationRequest;
  readonly requestHash: string;
  readonly observation: SpecialistContractMigrationObservation;
  readonly episodeId: string;
  readonly priorJournalHash: string;
  readonly priorJournalLastSeq: number;
  readonly migrationId: string;
  readonly declarationHash: string;
  readonly specialistId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly fromContractSha256: string;
  readonly toContractSha256: string;
  readonly reviewSubjectHash: string;
  readonly targetInputHash: string;
  readonly nativeAgentSha256: string;
  readonly reviewRound: number;
  readonly remainingRounds: number;
  readonly supersededRequestEventIds: readonly string[];
  readonly supersededCompletionEventIds: readonly string[];
  readonly pendingAuthorObligationIds: readonly string[];
  readonly nextAction: 'review-migrated-specialist';
}
export interface SpecialistContractMigrationInput {
  readonly stream: EventStreamState;
  readonly request: SpecialistContractMigrationRequest;
  readonly observation: SpecialistContractMigrationObservation;
}
export type SpecialistContractMigrationDecision =
  | { readonly kind: 'refused'; readonly code: string; readonly reasons: readonly string[] }
  | { readonly kind: 'migrate'; readonly receipt: SpecialistContractMigrationReceipt }
  | { readonly kind: 'already-migrated'; readonly receipt: SpecialistContractMigrationReceipt;
      readonly migrationEventId: string };
export type SpecialistContractMigrationProjection =
  | { readonly ok: false; readonly reasons: readonly string[] }
  | { readonly ok: true; readonly plan: MissionSpecialistPlan; readonly events: readonly CanonicalEvent[];
      readonly migration?: { readonly eventId: string; readonly seq: number;
        readonly receipt: SpecialistContractMigrationReceipt } };

const VISUAL = 'core:visual-craft-director';
const HASH = /^sha256:[a-f0-9]{64}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function field(event: CanonicalEvent, key: string): unknown {
  return record(event.payload) ? event.payload[key] : undefined;
}
function refuse(code: string, reason: string): SpecialistContractMigrationDecision {
  return { kind: 'refused', code, reasons: [reason] };
}
function stream(events: readonly CanonicalEvent[]): EventStreamState {
  return replayEventLog(events.map(serializeEvent).join('\n'));
}
function requestValue(value: unknown): value is SpecialistContractMigrationRequest {
  return record(value) && Object.keys(value).length === 4 && value['schemaVersion'] === 1
    && typeof value['expectedJournalHash'] === 'string' && HASH.test(value['expectedJournalHash'])
    && typeof value['expectedEpisodeId'] === 'string' && value['expectedEpisodeId'].startsWith('evt_')
    && value['migrationId'] === 'visual-craft-director-v2-v3';
}
function declarationValue(value: unknown): value is SpecialistContractMigrationDeclaration {
  return record(value) && value['id'] === 'visual-craft-director-v2-v3'
    && value['specialistId'] === VISUAL && value['fromVersion'] === 2 && value['toVersion'] === 3
    && value['policy'] === 'fresh-review-required'
    && value['fromContractPath'] === 'contract-history/visual-craft-director/v2.yaml'
    && ['fromContractSha256', 'toContractSha256'].every(key =>
      typeof value[key] === 'string' && HASH.test(value[key]));
}
function observationValue(value: unknown): value is SpecialistContractMigrationObservation {
  if (!record(value) || !declarationValue(value['declaration']) || !record(value['plan'])
    || !record(value['currentInputHashes'])) return false;
  const plan = value['plan'];
  return typeof plan['planHash'] === 'string' && HASH.test(plan['planHash'])
    && record(plan['context']) && ['complete', 'degraded'].includes(String(plan['context']['status']))
    && Array.isArray(plan['context']['issues']) && plan['context']['issues'].every(x => typeof x === 'string')
    && Array.isArray(plan['specialists']) && plan['specialists'].every(x => record(x)
      && typeof x['specialistId'] === 'string' && /^core:[a-z0-9-]+$/.test(x['specialistId'])
      && Number.isSafeInteger(x['contractVersion']) && Number(x['contractVersion']) > 0
      && ['applicable', 'not-applicable', 'degraded'].includes(String(x['state']))
      && Array.isArray(x['stages']) && x['stages'].length > 0
      && x['stages'].every(stage => ['pre-implementation', 'post-implementation'].includes(stage)))
    && Object.values(value['currentInputHashes']).every(x => typeof x === 'string' && HASH.test(x))
    && ['observedFromContractSha256', 'observedToContractSha256', 'nativeAgentSha256',
      'reviewSubjectHash', 'targetInputHash'].every(key => typeof value[key] === 'string' && HASH.test(value[key]))
    && Number.isSafeInteger(value['maxRounds']) && Number(value['maxRounds']) > 0 && Number(value['maxRounds']) <= 8
    && Number.isSafeInteger(value['nativeContractVersion'])
    && ['runtime:codex', 'runtime:claude'].includes(String(value['expectedSource']));
}
function sameInvocation(left: CanonicalEvent, right: CanonicalEvent): boolean {
  return left.subject === right.subject && ['stage', 'reviewRound', 'inputHash'].every(key =>
    field(left, key) === field(right, key));
}
function admit(input: SpecialistContractMigrationInput): SpecialistContractMigrationDecision {
  const { request, observation, stream: journal } = input;
  const events = journal.events;
  if (!requestValue(request) || !observationValue(observation)) return refuse('invalid-migration', 'Use the declared bounded migration request and observed inputs');
  const lifecycle = projectMissionLifecycle(events);
  if (journal.continuity !== 'complete' || journal.invalidLines > 0 || journal.duplicateEventIds > 0
    || lifecycle.status !== 'open') return refuse('invalid-journal', 'Migration requires the unchanged open mission episode');
  if (lifecycle.episodeId !== request.expectedEpisodeId || canonicalJsonHash(events) !== request.expectedJournalHash) {
    return refuse('stale-migration', 'Re-observe the active episode and journal before migration');
  }
  const recovered = validatedRecoveredReviewEvents(events);
  if (!recovered.ok) return refuse('invalid-recovery', recovered.reasons.join('; '));
  const declaration = observation.declaration;
  const selected = observation.plan.specialists.find(x => x.specialistId === VISUAL);
  if (request.migrationId !== declaration.id || selected?.contractVersion !== 2
    || selected.state !== 'applicable' || !selected.stages.includes('post-implementation')
    || observation.plan.context.status !== 'complete'
    || observation.plan.specialists.some(x => x.state === 'degraded')
    || field(events[0]!, 'planHash') !== observation.plan.planHash
    || `runtime:${String(field(events[0]!, 'runtime'))}` !== observation.expectedSource
    || observation.observedFromContractSha256 !== declaration.fromContractSha256
    || observation.observedToContractSha256 !== declaration.toContractSha256
    || observation.nativeContractVersion !== 3) return refuse('migration-contract-mismatch', 'Observe the original v2 plan and declared v3 assets/native specialist');
  const requested = events.filter(x => x.kind === 'specialist.requested' && x.subject === VISUAL);
  const episodeStart = events.find(x => x.eventId === lifecycle.episodeId);
  if (!episodeStart) return refuse('invalid-journal', 'Active mission episode has no original start event');
  const starts = events.filter(x => x.kind === 'specialist.started');
  if (starts.filter(start => start.seq > episodeStart.seq).some(start => !events.some(x => x.seq > start.seq && sameInvocation(start, x)
    && ['specialist.completed', 'specialist.failed'].includes(x.kind)))) return refuse('specialist-inflight', 'Wait for the started specialist to produce its terminal receipt');
  const writers = recovered.events.filter(x => x.kind === 'lead-writer.completed'
    && field(x, 'actionKind') !== 'run-preparation-correction');
  const first = writers[0]; const last = writers.at(-1);
  if (!first || !last) return refuse('missing-implementation', 'Migration applies only to an implemented post-review subject');
  const contracts = Object.fromEntries(observation.plan.specialists.map(x => [x.specialistId, x.contractVersion]));
  const review = reduceReviewLoop({ events: recovered.events, stage: 'post-implementation',
    expectedSource: observation.expectedSource, stageStartSeqExclusive: first.seq, afterSeqExclusive: last.seq,
    requiredSpecialists: observation.plan.specialists.filter(x => x.state === 'applicable'
      && x.stages.includes('post-implementation')).map(x => x.specialistId),
    contractVersions: contracts, currentInputHashes: observation.currentInputHashes, maxRounds: observation.maxRounds });
  if (review.issues.length > 0) return refuse('invalid-review', review.issues.map(x => x.detail).join('; '));
  const previous = recovered.events.filter(x => x.subject === VISUAL && x.kind === 'specialist.completed'
    && field(x, 'stage') === 'post-implementation');
  const reviewRound = review.reviewRound + (previous.some(x => x.seq > last.seq) ? 1 : 0);
  if (reviewRound > observation.maxRounds) return refuse('review-budget-exhausted', 'Migration grants no additional review round');
  const proofs = events.flatMap(event => {
    if (event.kind !== 'evidence.recorded') return [];
    const parsed = parseEvidence(field(event, 'evidence'));
    return parsed.ok ? [{ eventId: event.eventId, evidence: parsed.value }] : [];
  });
  const obligations = reduceEvidenceObligations({ events, expectedSource: observation.expectedSource,
    phase: 'post-implementation', proofs, evidenceContext: { dependencies: observation.evidenceDependencies ?? {} } });
  if (obligations.issues.length > 0) return refuse('invalid-evidence', obligations.issues.map(x => x.detail).join('; '));
  const receipt: SpecialistContractMigrationReceipt = {
    schemaVersion: 1, request, requestHash: canonicalJsonHash(request), observation,
    episodeId: lifecycle.episodeId, priorJournalHash: canonicalJsonHash(events), priorJournalLastSeq: journal.lastSeq,
    migrationId: declaration.id, declarationHash: canonicalJsonHash(declaration), specialistId: VISUAL,
    fromVersion: 2, toVersion: 3, fromContractSha256: declaration.fromContractSha256,
    toContractSha256: declaration.toContractSha256, reviewSubjectHash: observation.reviewSubjectHash,
    targetInputHash: observation.targetInputHash, nativeAgentSha256: observation.nativeAgentSha256,
    reviewRound, remainingRounds: observation.maxRounds - reviewRound + 1,
    supersededRequestEventIds: requested.filter(x => !starts.some(start => sameInvocation(start, x))).map(x => x.eventId),
    supersededCompletionEventIds: events.filter(x => x.kind === 'specialist.completed' && x.subject === VISUAL).map(x => x.eventId),
    pendingAuthorObligationIds: obligations.obligations.filter(x => x.specialistId === VISUAL
      && x.due === 'current-review' && !x.discharged).map(x => x.obligationId),
    nextAction: 'review-migrated-specialist',
  };
  if (new TextEncoder().encode(JSON.stringify(receipt)).length > 16_384) return refuse('migration-too-large', 'Bound migration receipt to 16 KiB');
  return { kind: 'migrate', receipt };
}
export function validatedSpecialistContractMigrations(
  events: readonly CanonicalEvent[], plan: MissionSpecialistPlan,
): SpecialistContractMigrationProjection {
  const migrations = events.filter(x => x.kind === 'specialist.contract-migrated');
  if (migrations.length === 0) return { ok: true, plan, events };
  const migration = migrations[0]!;
  const request = field(migration, 'request'); const observation = field(migration, 'observation');
  if (migrations.length !== 1 || projectMissionLifecycle(events).status === 'invalid'
    || migration.source !== 'void-harness:mission.migrate-specialist' || migration.subject !== VISUAL
    || !requestValue(request) || !observationValue(observation)
    || canonicalJsonHash(observation.plan) !== canonicalJsonHash(plan)) return { ok: false, reasons: ['Migration receipt does not match its original plan or producer'] };
  const decision = admit({ stream: stream(events.slice(0, migration.seq - 1)), request, observation });
  if (decision.kind !== 'migrate' || canonicalJsonHash(decision.receipt) !== canonicalJsonHash(migration.payload)) {
    return { ok: false, reasons: ['Migration receipt does not reproduce admission from its journal prefix'] };
  }
  const later = events.filter(x => x.seq > migration.seq && x.subject === VISUAL
    && ['specialist.requested', 'specialist.started', 'specialist.completed', 'specialist.failed'].includes(x.kind));
  const oldContexts = new Set(events.filter(x => x.seq < migration.seq).map(x => field(x, 'contextId')));
  if (later.some(x => {
    const completion = field(x, 'completion');
    const version = x.kind === 'specialist.completed' && record(completion) ? completion['contractVersion'] : field(x, 'contractVersion');
    return version !== 3 || field(x, 'inputHash') !== decision.receipt.targetInputHash
      || field(x, 'reviewRound') !== decision.receipt.reviewRound
      || (typeof field(x, 'contextId') === 'string' && oldContexts.has(field(x, 'contextId')));
  })) return { ok: false, reasons: ['Migrated review requires a fresh v3 request and context at the admitted input and round'] };
  return { ok: true, plan: { ...plan, specialists: plan.specialists.map(x => x.specialistId === VISUAL
    ? { ...x, contractVersion: 3 } : x) }, events,
    migration: { eventId: migration.eventId, seq: migration.seq, receipt: decision.receipt } };
}
export function planSpecialistContractMigration(input: SpecialistContractMigrationInput): SpecialistContractMigrationDecision {
  const projection = validatedSpecialistContractMigrations(input.stream.events, input.observation.plan);
  if (!projection.ok) return refuse('invalid-migration-receipt', projection.reasons.join('; '));
  if (projection.migration) {
    const { receipt, eventId } = projection.migration;
    if (canonicalJsonHash(receipt.request) !== canonicalJsonHash(input.request)
      || canonicalJsonHash(receipt.observation) !== canonicalJsonHash(input.observation)
      || projectMissionLifecycle(input.stream.events).status !== 'open') {
      return refuse('conflicting-migration', 'The recorded transition cannot authorize different inputs or another episode');
    }
    return { kind: 'already-migrated', receipt, migrationEventId: eventId };
  }
  return admit(input);
}

/** Recovery has no mutable plan: validate the migration against its recorded original plan. */
export function validatedSpecialistContractMigrationBoundary(events: readonly CanonicalEvent[]):
  | { readonly ok: false; readonly reasons: readonly string[] }
  | { readonly ok: true; readonly migration?: { readonly eventId: string; readonly seq: number;
      readonly receipt: SpecialistContractMigrationReceipt } } {
  const migration = events.find(event => event.kind === 'specialist.contract-migrated');
  if (migration === undefined) return { ok: true };
  const observation = field(migration, 'observation');
  if (!observationValue(observation)) return { ok: false, reasons: ['Migration observation is invalid'] };
  const validated = validatedSpecialistContractMigrations(events, observation.plan);
  if (!validated.ok) return validated;
  return { ok: true, ...(validated.migration === undefined ? {} : { migration: validated.migration }) };
}
