import { canonicalJsonHash } from '../evidence/canonical-json.js';
import type { MergedPolicy, MergedPolicyRule } from '../policy/merge.js';
import {
  MISSION_PASS_IDS,
  type MissionPassId,
  type PolicyWaiver,
} from '../policy/schema.js';
import { classifyRisk, RISK_CLASSIFIER_VERSION } from '../risk/classify.js';
import { deriveMissionSignals } from '../risk/predicates.js';
import {
  routeProfiles,
  type ProfileRoutingDecision,
  type ProfileRoutingInput,
} from '../profile/routing.js';
import type { ProfileDocument } from '../profile/schema.js';
import {
  routeSpecialists,
  type SpecialistRoutingContract,
  type SpecialistRoutingDecision,
  validateSpecialistCatalog,
} from '../specialist/routing.js';
import {
  buildMissionDag,
  type MissionDag,
  type MissionPassState,
} from './dag.js';

export interface MissionPlanInput {
  readonly schemaVersion: 2;
  readonly ticket: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
  };
  readonly diff: {
    readonly files: readonly string[];
    readonly status?: 'known' | 'unknown';
  };
  readonly stack: {
    readonly technologies: readonly string[];
    readonly status?: 'known' | 'unknown';
  };
  readonly policy: MergedPolicy;
  readonly profiles?: {
    readonly catalog: readonly ProfileDocument[];
    readonly input: ProfileRoutingInput;
  };
  readonly specialists: {
    readonly catalog: readonly SpecialistRoutingContract[];
  };
}

export interface ApplicabilityProof {
  readonly predicateId: string;
  readonly inputs: readonly string[];
  readonly reason: string;
  readonly inputHash: string;
  readonly classifierVersion: typeof RISK_CLASSIFIER_VERSION;
}

export interface ApplicabilityDecision {
  readonly pass: MissionPassId;
  readonly state: MissionPassState;
  readonly depth: 'none' | 'baseline' | 'deep' | 'unknown';
  readonly proof: ApplicabilityProof;
}

export interface MissionPlan {
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly inputHash: string;
  readonly planHash: string;
  readonly ticketId: string;
  readonly policySources: readonly string[];
  readonly policyWaivers: readonly PolicyWaiver[];
  readonly context: {
    readonly status: 'complete' | 'degraded';
    readonly issues: readonly string[];
  };
  readonly risk: ReturnType<typeof classifyRisk>;
  readonly applicability: readonly ApplicabilityDecision[];
  readonly profiles: readonly ProfileRoutingDecision[];
  readonly specialists: readonly SpecialistRoutingDecision[];
  readonly dag: MissionDag;
}

export interface CompileMissionPlanOptions {
  readonly generatedAt?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function bounded(value: string, minimum: number, maximum: number): boolean {
  if (value.length < minimum || value.length > maximum) return false;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x20 || point === 0x7f) return false;
  }
  return true;
}

function normalizeList(
  values: readonly string[],
  maximum: number,
  field: string,
): readonly string[] {
  if (values.length > maximum || values.some((value) => !bounded(value, 1, 512))) {
    throw new Error(`MISSION_INPUT_INVALID: ${field} is not bounded`);
  }
  return Object.freeze([...new Set(values)].sort());
}

function normalizeFiles(values: readonly string[]): readonly string[] {
  const files = normalizeList(values, 2_048, 'diff.files');
  for (const file of files) {
    const segments = file.split('/');
    if (
      file.startsWith('/')
      || file.includes('\\')
      || /^[A-Za-z]:/.test(file)
      || segments.includes('..')
    ) {
      throw new Error('MISSION_INPUT_INVALID: diff.files must be relative paths');
    }
  }
  return files;
}

function normalizeSpecialists(
  specialists: MissionPlanInput['specialists'] | undefined,
): MissionPlanInput['specialists'] {
  if (specialists === undefined || !Array.isArray(specialists.catalog)) {
    throw new Error('MISSION_INPUT_INVALID: specialists.catalog is required in schemaVersion 2');
  }
  validateSpecialistCatalog(specialists.catalog);
  const catalog = specialists.catalog.map((contract) => Object.freeze({
    ...contract,
    stages: Object.freeze([...contract.stages].sort()),
    appliesWhen: Object.freeze({
      ...contract.appliesWhen,
      any: Object.freeze([...contract.appliesWhen.any].sort()),
    }),
  })).sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({ catalog: Object.freeze(catalog) });
}

function normalizeInput(input: MissionPlanInput): MissionPlanInput {
  if (input.schemaVersion !== 2) {
    throw new Error('MISSION_INPUT_INVALID: schemaVersion must be 2');
  }
  if (!bounded(input.ticket.id, 1, 128)) {
    throw new Error('MISSION_INPUT_INVALID: ticket.id is not bounded');
  }
  if (!bounded(input.ticket.title, 1, 200)) {
    throw new Error('MISSION_INPUT_INVALID: ticket.title is not bounded');
  }
  if (input.ticket.body.length > 100_000) {
    throw new Error('MISSION_INPUT_INVALID: ticket.body exceeds 100000 characters');
  }
  return Object.freeze({
    schemaVersion: 2,
    ticket: Object.freeze({ ...input.ticket }),
    diff: Object.freeze({
      files: normalizeFiles(input.diff.files),
      status: input.diff.status ?? 'known',
    }),
    stack: Object.freeze({
      technologies: normalizeList(input.stack.technologies, 64, 'stack.technologies'),
      status: input.stack.status ?? 'known',
    }),
    policy: input.policy,
    ...(input.profiles === undefined ? {} : { profiles: input.profiles }),
    specialists: normalizeSpecialists(input.specialists),
  });
}

function matchingSignals(
  rule: MergedPolicyRule,
  signals: ReadonlySet<string>,
): readonly string[] {
  const any = rule.appliesWhen.any.filter((signal) => signals.has(signal));
  const allMatch = rule.appliesWhen.all.every((signal) => signals.has(signal));
  const noneMatch = rule.appliesWhen.none.some((signal) => signals.has(signal));
  if (!allMatch || noneMatch) return Object.freeze([]);
  if (rule.appliesWhen.any.length > 0 && any.length === 0) return Object.freeze([]);
  return Object.freeze([
    ...any,
    ...rule.appliesWhen.all,
  ].sort());
}

function proof(
  pass: MissionPassId,
  state: MissionPassState,
  inputs: readonly string[],
  inputHash: string,
): ApplicabilityProof {
  const reason = state === 'pending'
    ? `pass '${pass}' is applicable at its declared depth`
    : state === 'not-applicable'
      ? `pass '${pass}' predicates did not match current inputs`
      : `pass '${pass}' has insufficient policy or input evidence`;
  return Object.freeze({
    predicateId: `applicability:${pass}`,
    inputs: Object.freeze([...inputs]),
    reason,
    inputHash,
    classifierVersion: RISK_CLASSIFIER_VERSION,
  });
}

function decisionFor(
  pass: MissionPassId,
  rules: readonly MergedPolicyRule[],
  signals: ReadonlySet<string>,
  knownInputs: boolean,
  inputHash: string,
): ApplicabilityDecision {
  const passRules = rules.filter((rule) => rule.pass === pass);
  const matches = passRules.flatMap((rule) => matchingSignals(rule, signals));
  const baseline = passRules.some((rule) => rule.baseline);
  const state: MissionPassState = baseline || matches.length > 0
    ? 'pending'
    : passRules.length === 0 || !knownInputs
      ? 'unknown'
      : 'not-applicable';
  const depth = matches.length > 0
    ? 'deep'
    : baseline
      ? 'baseline'
      : state === 'unknown' ? 'unknown' : 'none';
  const proofInputs = matches.length > 0
    ? [...new Set(matches)].sort()
    : state === 'pending'
      ? ['policy:baseline']
      : state === 'not-applicable'
        ? ['ticket', 'diff.files', 'stack.technologies']
        : ['context:unavailable'];
  return Object.freeze({
    pass,
    state,
    depth,
    proof: proof(pass, state, proofInputs, inputHash),
  });
}

function planHashInput(plan: Omit<MissionPlan, 'generatedAt' | 'planHash'>): unknown {
  return plan;
}

function missionContext(
  input: MissionPlanInput,
  profiles: readonly ProfileRoutingDecision[],
): MissionPlan['context'] {
  const issues: string[] = [];
  if (input.diff.status === 'unknown') issues.push('diff-unavailable');
  if (input.stack.status === 'unknown') issues.push('stack-unavailable');
  if (input.profiles?.input.status === 'degraded') issues.push('profile-detection-incomplete');
  for (const profile of profiles) {
    if (profile.state === 'degraded') issues.push(`profile-degraded:${profile.profileId}`);
  }
  return Object.freeze({
    status: issues.length === 0 ? 'complete' : 'degraded',
    issues: Object.freeze(issues),
  });
}

export function compileMissionPlan(
  rawInput: MissionPlanInput,
  options: CompileMissionPlanOptions = {},
): MissionPlan {
  if (rawInput.policy.conflicts.length > 0) {
    const rules = rawInput.policy.conflicts.map((item) => item.ruleId).join(', ');
    throw new Error(`MISSION_POLICY_CONFLICT: unresolved rules: ${rules}`);
  }
  const input = normalizeInput(rawInput);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (!ISO_UTC.test(generatedAt)) {
    throw new Error('MISSION_INPUT_INVALID: generatedAt must be an ISO UTC timestamp');
  }
  const classifierInput = {
    ticket: `${input.ticket.title}\n${input.ticket.body}`,
    files: input.diff.files,
    stack: input.stack.technologies,
    complete: input.diff.status === 'known' && input.stack.status === 'known',
  };
  const inputHash = canonicalJsonHash(input);
  const profiles = input.profiles === undefined
    ? Object.freeze([])
    : routeProfiles(input.profiles.catalog, input.profiles.input, { now: generatedAt });
  const risk = classifyRisk(classifierInput);
  const signals = new Set(deriveMissionSignals(classifierInput));
  for (const rule of input.policy.rules) {
    if (rule.baseline) signals.add(`${rule.pass}-baseline`);
  }
  const context = missionContext(input, profiles);
  const routingContextStatus = classifierInput.complete
    && (input.profiles === undefined || input.profiles.input.status === 'complete')
    ? 'complete'
    : 'degraded';
  const specialists = routeSpecialists(input.specialists.catalog, {
    signals,
    profiles,
    contextStatus: routingContextStatus,
    inputHash,
  });
  const knownInputs = classifierInput.complete
    && (
      classifierInput.ticket.trim() !== ''
      || classifierInput.files.length > 0
      || classifierInput.stack.length > 0
    );
  const applicability = Object.freeze(MISSION_PASS_IDS.map((pass) =>
    decisionFor(pass, input.policy.rules, signals, knownInputs, inputHash),
  ));
  const states = new Map(applicability.map((item) => [item.pass, item.state]));
  const dag = buildMissionDag(states, MISSION_PASS_IDS);
  const stable = Object.freeze({
    schemaVersion: 2 as const,
    inputHash,
    ticketId: input.ticket.id,
    policySources: input.policy.sources,
    policyWaivers: input.policy.waivers,
    context,
    risk,
    applicability,
    profiles,
    specialists,
    dag,
  });
  return Object.freeze({
    ...stable,
    generatedAt,
    planHash: canonicalJsonHash(planHashInput(stable)),
  });
}
