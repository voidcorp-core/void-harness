import type { ProfileRoutingDecision } from '../profile/routing.js';
import { RISK_CLASSIFIER_VERSION } from '../risk/classify.js';

const SPECIALIST_ID = /^core:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_SPECIALISTS = 32;

export type SpecialistId = `core:${string}`;
export type SpecialistInvocationStage = 'pre-implementation' | 'post-implementation';

export interface SpecialistRoutingContract {
  readonly id: SpecialistId | string;
  readonly version: number;
  readonly name: string;
  readonly stages: readonly SpecialistInvocationStage[];
  readonly appliesWhen: {
    readonly any: readonly string[];
  };
}

export interface SpecialistRoutingInput {
  readonly signals: ReadonlySet<string>;
  readonly profiles: readonly ProfileRoutingDecision[];
  readonly contextStatus: 'complete' | 'degraded';
  readonly inputHash: string;
}

export interface SpecialistRoutingProof {
  readonly predicateId: string;
  readonly inputs: readonly string[];
  readonly reason: string;
  readonly inputHash: string;
  readonly classifierVersion: typeof RISK_CLASSIFIER_VERSION;
}

export interface SpecialistRoutingDecision {
  readonly specialistId: SpecialistId;
  readonly contractVersion: number;
  readonly state: 'applicable' | 'not-applicable' | 'degraded';
  readonly stages: readonly SpecialistInvocationStage[];
  readonly proof: SpecialistRoutingProof;
}

export function validateSpecialistCatalog(
  contracts: unknown,
): asserts contracts is readonly SpecialistRoutingContract[] {
  if (!Array.isArray(contracts)) {
    throw new Error('SPECIALIST_ROUTING_INVALID: catalog must be an array');
  }
  if (contracts.length < 1 || contracts.length > MAX_SPECIALISTS) {
    throw new Error(
      `SPECIALIST_ROUTING_INVALID: catalog must contain 1 to ${MAX_SPECIALISTS} entries`,
    );
  }
  const ids = new Set<string>();
  for (const candidate of contracts) {
    const contract = typeof candidate === 'object' && candidate !== null
      ? candidate as Partial<SpecialistRoutingContract>
      : undefined;
    const predicates = contract !== undefined
      && typeof contract.appliesWhen === 'object'
      && contract.appliesWhen !== null
      && Array.isArray(contract.appliesWhen.any)
      ? contract.appliesWhen.any
      : undefined;
    if (
      contract === undefined
      || typeof contract.id !== 'string'
      || !SPECIALIST_ID.test(contract.id)
      || typeof contract.name !== 'string'
      || !SLUG.test(contract.name)
      || contract.id !== `core:${contract.name}`
      || !Array.isArray(contract.stages)
      || contract.stages.length < 1
      || contract.stages.length > 2
      || contract.stages.some((stage) =>
        stage !== 'pre-implementation' && stage !== 'post-implementation')
      || new Set(contract.stages).size !== contract.stages.length
      || !Number.isSafeInteger(contract.version)
      || Number(contract.version) < 1
      || Number(contract.version) > 10_000
      || predicates === undefined
      || predicates.length < 1
      || predicates.length > 16
      || predicates.some((predicate) => typeof predicate !== 'string' || !SLUG.test(predicate))
      || new Set(predicates).size !== predicates.length
    ) {
      const id = typeof contract?.id === 'string' ? contract.id : '<unknown>';
      throw new Error(`SPECIALIST_ROUTING_INVALID: malformed contract '${id}'`);
    }
    if (ids.has(contract.id)) {
      throw new Error(`SPECIALIST_ROUTING_INVALID: duplicate specialist id '${contract.id}'`);
    }
    ids.add(contract.id);
  }
}

function profileSignals(
  profiles: readonly ProfileRoutingDecision[],
  state: 'applicable' | 'degraded',
): ReadonlySet<string> {
  const signals = new Set<string>();
  for (const profile of profiles) {
    if (profile.state !== state) continue;
    const name = profile.profileId.startsWith('core:')
      ? profile.profileId.slice('core:'.length)
      : profile.profileId;
    if (SLUG.test(name)) signals.add(`profile-${name}`);
    for (const pattern of profile.activePatternIds) {
      if (SLUG.test(pattern)) signals.add(`pattern-${pattern}`);
    }
  }
  return signals;
}

function proof(
  contract: SpecialistRoutingContract,
  state: SpecialistRoutingDecision['state'],
  inputs: readonly string[],
  inputHash: string,
): SpecialistRoutingProof {
  const reason = state === 'applicable'
    ? `specialist '${contract.id}' has matching applicability evidence`
    : state === 'not-applicable'
      ? `specialist '${contract.id}' predicates did not match complete inputs`
      : `specialist '${contract.id}' cannot be excluded because routing evidence is incomplete`;
  return Object.freeze({
    predicateId: `specialist:${contract.name}:applies-when`,
    inputs: Object.freeze([...inputs]),
    reason,
    inputHash,
    classifierVersion: RISK_CLASSIFIER_VERSION,
  });
}

export function routeSpecialists(
  contracts: readonly SpecialistRoutingContract[],
  input: SpecialistRoutingInput,
): readonly SpecialistRoutingDecision[] {
  validateSpecialistCatalog(contracts);
  if (!HASH.test(input.inputHash)) {
    throw new Error('SPECIALIST_ROUTING_INVALID: inputHash must be a canonical SHA-256 hash');
  }
  const applicableProfileSignals = profileSignals(input.profiles, 'applicable');
  const degradedProfileSignals = profileSignals(input.profiles, 'degraded');
  const knownSignals = new Set([...input.signals, ...applicableProfileSignals]);
  return Object.freeze([...contracts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((contract) => {
      const matches = [...contract.appliesWhen.any]
        .filter((predicate) => knownSignals.has(predicate))
        .sort();
      const degradedMatches = [...contract.appliesWhen.any]
        .filter((predicate) => degradedProfileSignals.has(predicate))
        .sort();
      const state: SpecialistRoutingDecision['state'] = matches.length > 0
        ? 'applicable'
        : degradedMatches.length > 0 || input.contextStatus === 'degraded'
          ? 'degraded'
          : 'not-applicable';
      const proofInputs = matches.length > 0
        ? matches
        : degradedMatches.length > 0
          ? degradedMatches
          : state === 'degraded'
            ? ['context:unavailable']
            : ['ticket', 'diff.files', 'stack.technologies', 'profiles'];
      return Object.freeze({
        specialistId: contract.id as SpecialistId,
        contractVersion: contract.version,
        state,
        stages: Object.freeze([...contract.stages]),
        proof: proof(contract, state, proofInputs, input.inputHash),
      });
    }));
}
