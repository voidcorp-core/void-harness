import type {
  PolicyDocument,
  PolicyLayer,
  PolicyRule,
  PolicyStrength,
  PolicyWaiver,
} from './schema.js';

export interface MergedPolicyRule extends PolicyRule {
  readonly sourcePolicyId: string;
  readonly sourceLayer: PolicyLayer;
  readonly waiverId?: string;
}

export interface PolicyConflict {
  readonly code:
    | 'duplicate-precedence'
    | 'policy-weakening'
    | 'policy-target-change';
  readonly ruleId: string;
  readonly sourcePolicyId: string;
  readonly message: string;
}

export interface MergedPolicy {
  readonly schemaVersion: 1;
  readonly sources: readonly string[];
  readonly rules: readonly MergedPolicyRule[];
  readonly waivers: readonly PolicyWaiver[];
  readonly conflicts: readonly PolicyConflict[];
}

const LAYER_RANK: Readonly<Record<PolicyLayer, number>> = {
  core: 0,
  profile: 1,
  organization: 2,
  project: 3,
};

const STRENGTH_RANK: Readonly<Record<PolicyStrength, number>> = {
  advisory: 0,
  required: 1,
  blocking: 2,
};

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function includesAll(
  values: readonly string[],
  expected: readonly string[],
): boolean {
  const valueSet = new Set(values);
  return expected.every((value) => valueSet.has(value));
}

function predicateWeakens(current: PolicyRule, next: PolicyRule): boolean {
  if (current.baseline && !next.baseline) return true;
  if (!includesAll(next.appliesWhen.any, current.appliesWhen.any)) return true;
  if (!includesAll(current.appliesWhen.all, next.appliesWhen.all)) return true;
  return !includesAll(current.appliesWhen.none, next.appliesWhen.none);
}

function weakens(current: PolicyRule, next: PolicyRule): boolean {
  return STRENGTH_RANK[next.strength] < STRENGTH_RANK[current.strength]
    || predicateWeakens(current, next);
}

function activeWaiver(
  policy: PolicyDocument,
  ruleId: string,
  now: string,
): PolicyWaiver | undefined {
  if (policy.layer !== 'organization' && policy.layer !== 'project') {
    return undefined;
  }
  const nowMs = Date.parse(now);
  return policy.waivers.find((waiver) =>
    waiver.ruleId === ruleId
    && Date.parse(waiver.approvedAt) <= nowMs
    && Date.parse(waiver.expiresAt) > nowMs,
  );
}

function mergedRule(
  rule: PolicyRule,
  policy: PolicyDocument,
  waiver?: PolicyWaiver,
): MergedPolicyRule {
  return Object.freeze({
    ...rule,
    sourcePolicyId: policy.id,
    sourceLayer: policy.layer,
    ...(waiver === undefined ? {} : { waiverId: waiver.id }),
  });
}

function conflict(
  code: PolicyConflict['code'],
  ruleId: string,
  policy: PolicyDocument,
  message: string,
): PolicyConflict {
  return Object.freeze({ code, ruleId, sourcePolicyId: policy.id, message });
}

function sortedPolicies(policies: readonly PolicyDocument[]): PolicyDocument[] {
  return [...policies].sort((left, right) =>
    LAYER_RANK[left.layer] - LAYER_RANK[right.layer]
    || compareId(left.id, right.id),
  );
}

function applyOverride(
  current: MergedPolicyRule,
  next: PolicyRule,
  policy: PolicyDocument,
  now: string,
): MergedPolicyRule | PolicyConflict {
  if (current.sourceLayer === policy.layer) {
    return conflict(
      'duplicate-precedence',
      next.id,
      policy,
      `rule '${next.id}' is declared twice at ${policy.layer} precedence`,
    );
  }
  if (current.pass !== next.pass) {
    return conflict(
      'policy-target-change',
      next.id,
      policy,
      `rule '${next.id}' cannot change pass from ${current.pass} to ${next.pass}`,
    );
  }
  if (!weakens(current, next)) return mergedRule(next, policy);
  const waiver = activeWaiver(policy, next.id, now);
  if (waiver !== undefined) return mergedRule(next, policy, waiver);
  return conflict(
    'policy-weakening',
    next.id,
    policy,
    `rule '${next.id}' weakens ${current.sourceLayer} without an active waiver`,
  );
}

export function mergePolicies(
  policies: readonly PolicyDocument[],
  now: string,
): MergedPolicy {
  const rules = new Map<string, MergedPolicyRule>();
  const conflicts: PolicyConflict[] = [];
  const usedWaiverIds = new Set<string>();
  const ordered = sortedPolicies(policies);
  for (const policy of ordered) {
    for (const rule of policy.rules) {
      const current = rules.get(rule.id);
      if (current === undefined) {
        rules.set(rule.id, mergedRule(rule, policy));
        continue;
      }
      const outcome = applyOverride(current, rule, policy, now);
      if ('code' in outcome) {
        conflicts.push(outcome);
        continue;
      }
      rules.set(rule.id, outcome);
      if (outcome.waiverId !== undefined) usedWaiverIds.add(outcome.waiverId);
    }
  }
  const waivers = ordered
    .flatMap((policy) => policy.waivers)
    .filter((waiver) => usedWaiverIds.has(waiver.id))
    .sort((left, right) => compareId(left.id, right.id));
  return Object.freeze({
    schemaVersion: 1,
    sources: Object.freeze(ordered.map((policy) => policy.id)),
    rules: Object.freeze([...rules.values()].sort((left, right) =>
      compareId(left.id, right.id),
    )),
    waivers: Object.freeze(waivers),
    conflicts: Object.freeze(conflicts.sort((left, right) =>
      compareId(left.ruleId, right.ruleId),
    )),
  });
}
