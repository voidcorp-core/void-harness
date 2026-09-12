import { canonicalJsonHash } from '../evidence/canonical-json.js';

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_CANDIDATES = 256;
const NETWORK_RANK = { none: 0, 'read-only': 1, full: 2 } as const;

export type RouteNetwork = keyof typeof NETWORK_RANK;

export interface RouteCandidate {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly schemas: readonly string[];
  readonly projectFacts: readonly string[];
  readonly packs: readonly string[];
  readonly runtimeFeatures: readonly string[];
  readonly permissions: readonly string[];
  readonly network: RouteNetwork;
  readonly budgetMicroUsd: number;
  readonly compatibility: string;
}

export interface RouteRequest {
  readonly inputHash: string;
  readonly requiredCapabilities: readonly string[];
  readonly requiredSchemas: readonly string[];
  readonly requiredProjectFacts: readonly string[];
  readonly requiredPacks: readonly string[];
  readonly requiredRuntimeFeatures: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly requiredNetwork: RouteNetwork;
  readonly maxBudgetMicroUsd: number;
  readonly compatibility: string;
  readonly allowIds?: readonly string[];
  readonly denyIds?: readonly string[];
}

export type RouteRejectionReason =
  | `missing-capability:${string}`
  | `missing-schema:${string}`
  | `missing-project-fact:${string}`
  | `missing-pack:${string}`
  | `missing-runtime-feature:${string}`
  | `missing-permission:${string}`
  | 'network-unavailable'
  | 'network-too-permissive'
  | 'budget-exceeded'
  | 'incompatible'
  | 'policy-denied'
  | 'policy-not-allowed';

export interface RouteRejection {
  readonly candidateId: string;
  readonly reasons: readonly RouteRejectionReason[];
}

export interface RouteScore {
  readonly candidateId: string;
  readonly score: number;
}

export interface RouteProof {
  readonly inputHash: string;
  readonly candidateIds: readonly string[];
  readonly eligibleIds: readonly string[];
  readonly rejections: readonly RouteRejection[];
  readonly scores: readonly RouteScore[];
  readonly tieBreak: 'score-desc-id-asc';
  readonly fallback: 'none' | 'no-ranker' | 'invalid-semantic-output';
  readonly proofHash: string;
}

export interface RouteResult {
  readonly eligibleIds: readonly string[];
  readonly orderedIds: readonly string[];
  readonly rejections: readonly RouteRejection[];
  readonly proof: RouteProof;
}

export type SemanticRanker = (
  candidates: readonly RouteCandidate[],
  request: RouteRequest,
) => Readonly<Record<string, number>>;

function invalid(detail: string): never {
  throw new Error(`ROUTING_INVALID: ${detail}`);
}

function uniqueSorted(values: readonly string[], field: string): readonly string[] {
  if (values.some((value) => typeof value !== 'string' || value.length === 0)) {
    invalid(`${field} must contain non-empty strings`);
  }
  if (new Set(values).size !== values.length) invalid(`${field} contains duplicates`);
  return Object.freeze([...values].sort());
}

function validateCandidate(candidate: RouteCandidate): void {
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) invalid('candidate id');
  if (!['none', 'read-only', 'full'].includes(candidate.network)) {
    invalid(`candidate '${candidate.id}' network`);
  }
  if (!Number.isSafeInteger(candidate.budgetMicroUsd) || candidate.budgetMicroUsd < 0) {
    invalid(`candidate '${candidate.id}' budget`);
  }
  if (typeof candidate.compatibility !== 'string' || candidate.compatibility.length === 0) {
    invalid(`candidate '${candidate.id}' compatibility`);
  }
  uniqueSorted(candidate.capabilities, `candidate '${candidate.id}' capabilities`);
  uniqueSorted(candidate.schemas, `candidate '${candidate.id}' schemas`);
  uniqueSorted(candidate.projectFacts, `candidate '${candidate.id}' projectFacts`);
  uniqueSorted(candidate.packs, `candidate '${candidate.id}' packs`);
  uniqueSorted(candidate.runtimeFeatures, `candidate '${candidate.id}' runtimeFeatures`);
  uniqueSorted(candidate.permissions, `candidate '${candidate.id}' permissions`);
}

function validateRequest(request: RouteRequest): void {
  if (!HASH.test(request.inputHash)) invalid('inputHash must be a canonical SHA-256 hash');
  if (!Number.isSafeInteger(request.maxBudgetMicroUsd) || request.maxBudgetMicroUsd < 0) {
    invalid('maxBudgetMicroUsd');
  }
  if (!['none', 'read-only', 'full'].includes(request.requiredNetwork)) invalid('requiredNetwork');
  if (typeof request.compatibility !== 'string' || request.compatibility.length === 0) invalid('compatibility');
  uniqueSorted(request.requiredCapabilities, 'requiredCapabilities');
  uniqueSorted(request.requiredSchemas, 'requiredSchemas');
  uniqueSorted(request.requiredProjectFacts, 'requiredProjectFacts');
  uniqueSorted(request.requiredPacks, 'requiredPacks');
  uniqueSorted(request.requiredRuntimeFeatures, 'requiredRuntimeFeatures');
  uniqueSorted(request.requiredPermissions, 'requiredPermissions');
  if (request.allowIds !== undefined) uniqueSorted(request.allowIds, 'allowIds');
  if (request.denyIds !== undefined) uniqueSorted(request.denyIds, 'denyIds');
}

type MissingPrefix = 'missing-capability' | 'missing-schema' | 'missing-project-fact'
  | 'missing-pack' | 'missing-runtime-feature' | 'missing-permission';

function missingReason(prefix: MissingPrefix, value: string): RouteRejectionReason {
  switch (prefix) {
    case 'missing-capability': return `missing-capability:${value}`;
    case 'missing-schema': return `missing-schema:${value}`;
    case 'missing-project-fact': return `missing-project-fact:${value}`;
    case 'missing-pack': return `missing-pack:${value}`;
    case 'missing-runtime-feature': return `missing-runtime-feature:${value}`;
    case 'missing-permission': return `missing-permission:${value}`;
  }
}

function missing(required: readonly string[], provided: readonly string[], prefix: MissingPrefix): RouteRejectionReason[] {
  const available = new Set(provided);
  return required.filter((item) => !available.has(item)).map((item) => missingReason(prefix, item));
}

function reasonsFor(candidate: RouteCandidate, request: RouteRequest): readonly RouteRejectionReason[] {
  const reasons: RouteRejectionReason[] = [
    ...missing(request.requiredCapabilities, candidate.capabilities, 'missing-capability'),
    ...missing(request.requiredSchemas, candidate.schemas, 'missing-schema'),
    ...missing(request.requiredProjectFacts, candidate.projectFacts, 'missing-project-fact'),
    ...missing(request.requiredPacks, candidate.packs, 'missing-pack'),
    ...missing(request.requiredRuntimeFeatures, candidate.runtimeFeatures, 'missing-runtime-feature'),
    ...missing(request.requiredPermissions, candidate.permissions, 'missing-permission'),
  ];
  const candidateNetwork = NETWORK_RANK[candidate.network];
  const requiredNetwork = NETWORK_RANK[request.requiredNetwork];
  if (candidateNetwork < requiredNetwork) reasons.push('network-unavailable');
  if (candidateNetwork > requiredNetwork) reasons.push('network-too-permissive');
  if (candidate.budgetMicroUsd > request.maxBudgetMicroUsd) reasons.push('budget-exceeded');
  if (candidate.compatibility !== request.compatibility) reasons.push('incompatible');
  if (request.denyIds?.includes(candidate.id) === true) reasons.push('policy-denied');
  if (request.allowIds !== undefined && !request.allowIds.includes(candidate.id)) reasons.push('policy-not-allowed');
  return Object.freeze([...reasons].sort());
}

function immutableCandidate(candidate: RouteCandidate): RouteCandidate {
  return Object.freeze({
    ...candidate,
    capabilities: Object.freeze([...candidate.capabilities]),
    schemas: Object.freeze([...candidate.schemas]),
    projectFacts: Object.freeze([...candidate.projectFacts]),
    packs: Object.freeze([...candidate.packs]),
    runtimeFeatures: Object.freeze([...candidate.runtimeFeatures]),
    permissions: Object.freeze([...candidate.permissions]),
  });
}

function immutableRequest(request: RouteRequest): RouteRequest {
  return Object.freeze({
    ...request,
    requiredCapabilities: Object.freeze([...request.requiredCapabilities]),
    requiredSchemas: Object.freeze([...request.requiredSchemas]),
    requiredProjectFacts: Object.freeze([...request.requiredProjectFacts]),
    requiredPacks: Object.freeze([...request.requiredPacks]),
    requiredRuntimeFeatures: Object.freeze([...request.requiredRuntimeFeatures]),
    requiredPermissions: Object.freeze([...request.requiredPermissions]),
    ...(request.allowIds === undefined ? {} : { allowIds: Object.freeze([...request.allowIds]) }),
    ...(request.denyIds === undefined ? {} : { denyIds: Object.freeze([...request.denyIds]) }),
  });
}

function validScores(scores: Readonly<Record<string, number>>, eligibleIds: readonly string[]): boolean {
  const eligible = new Set(eligibleIds);
  const keys = Object.keys(scores);
  return keys.length === eligibleIds.length
    && keys.every((id) => eligible.has(id) && Number.isFinite(scores[id]));
}

export function routeCandidates(
  candidates: readonly RouteCandidate[],
  request: RouteRequest,
  ranker?: SemanticRanker,
): RouteResult {
  if (candidates.length > MAX_CANDIDATES) invalid(`candidate count exceeds ${MAX_CANDIDATES}`);
  validateRequest(request);
  const sorted = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  const candidateIds = sorted.map((candidate) => candidate.id);
  if (new Set(candidateIds).size !== candidateIds.length) invalid('duplicate candidate id');
  sorted.forEach(validateCandidate);
  const decisions = sorted.map((candidate) => ({ candidate, reasons: reasonsFor(candidate, request) }));
  const rejections = Object.freeze(decisions
    .filter((decision) => decision.reasons.length > 0)
    .map((decision) => ({ candidateId: decision.candidate.id, reasons: decision.reasons })));
  const eligible = decisions.filter((decision) => decision.reasons.length === 0).map((decision) => decision.candidate);
  const eligibleIds = Object.freeze(eligible.map((candidate) => candidate.id));
  let orderedIds: readonly string[] = eligibleIds;
  let scores: readonly RouteScore[] = Object.freeze([]);
  let fallback: RouteProof['fallback'] = ranker === undefined ? 'no-ranker' : 'invalid-semantic-output';
  if (ranker !== undefined && eligible.length > 0) {
    try {
      const result = ranker(
        Object.freeze(eligible.map(immutableCandidate)),
        immutableRequest(request),
      );
      if (validScores(result, eligibleIds)) {
        scores = Object.freeze(eligibleIds.map((candidateId) => ({ candidateId, score: result[candidateId] ?? 0 }))
          .sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId)));
        orderedIds = Object.freeze(scores.map((score) => score.candidateId));
        fallback = 'none';
      }
    } catch {
      fallback = 'invalid-semantic-output';
    }
  }
  const proofWithoutHash = {
    inputHash: request.inputHash,
    candidateIds: Object.freeze(candidateIds),
    eligibleIds,
    rejections,
    scores,
    tieBreak: 'score-desc-id-asc' as const,
    fallback,
  };
  const proof = Object.freeze({ ...proofWithoutHash, proofHash: canonicalJsonHash(proofWithoutHash) });
  return Object.freeze({ eligibleIds, orderedIds, rejections, proof });
}
