export const POLICY_SCHEMA_VERSION = 1;
export const MAX_POLICY_RULES = 64;
export const MAX_POLICY_WAIVERS = 32;
export const MAX_POLICY_SIGNALS = 32;

export const MISSION_PASS_IDS = [
  'product',
  'architecture',
  'tdd',
  'qa',
  'security',
  'observability',
  'migration',
  'ux-ui',
  'accessibility',
  'performance',
  'stack-patterns',
  'pdf',
  'retrospective',
] as const;

export type MissionPassId = typeof MISSION_PASS_IDS[number];
export type PolicyLayer = 'core' | 'profile' | 'organization' | 'project';
export type PolicyStrength = 'advisory' | 'required' | 'blocking';

export interface PolicyPredicate {
  readonly any: readonly string[];
  readonly all: readonly string[];
  readonly none: readonly string[];
}

export interface PolicyRule {
  readonly id: string;
  readonly pass: MissionPassId;
  readonly strength: PolicyStrength;
  readonly baseline: boolean;
  readonly appliesWhen: PolicyPredicate;
}

export interface PolicyWaiver {
  readonly id: string;
  readonly ruleId: string;
  readonly reason: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export interface PolicyDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly layer: PolicyLayer;
  readonly rules: readonly PolicyRule[];
  readonly waivers: readonly PolicyWaiver[];
}

interface PolicyIssue {
  readonly code: 'invalid-policy';
  readonly message: string;
}

export type PolicyParseResult =
  | { readonly ok: true; readonly value: PolicyDocument }
  | { readonly ok: false; readonly issue: PolicyIssue };

const POLICY_ID = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/;
const SIGNAL_ID = /^[a-z][a-z0-9-]{0,63}$/;
const UTC_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function invalid(message: string): PolicyParseResult {
  return { ok: false, issue: { code: 'invalid-policy', message } };
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return Object.fromEntries(Object.entries(value));
}

function unknownField(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(value).find((key) => !allowed.has(key));
}

function label(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    return false;
  }
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x20 || point === 0x7f) return false;
  }
  return true;
}

function stringList(value: unknown, field: string): readonly string[] | string {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_POLICY_SIGNALS) {
    return `${field} must be an array of at most ${MAX_POLICY_SIGNALS} signals`;
  }
  if (!value.every((item) => label(item, 1, 64) && SIGNAL_ID.test(item))) {
    return `${field} contains an invalid signal`;
  }
  const values = [...value].sort();
  if (new Set(values).size !== values.length) {
    return `${field} contains duplicate signals`;
  }
  return Object.freeze(values);
}

function parsePredicate(value: unknown): PolicyPredicate | string {
  if (value === undefined) {
    return Object.freeze({ any: [], all: [], none: [] });
  }
  const raw = record(value);
  if (raw === undefined) return 'appliesWhen must be a plain object';
  const extra = unknownField(raw, new Set(['any', 'all', 'none']));
  if (extra !== undefined) return `appliesWhen has unknown field '${extra}'`;
  const any = stringList(raw['any'], 'appliesWhen.any');
  const all = stringList(raw['all'], 'appliesWhen.all');
  const none = stringList(raw['none'], 'appliesWhen.none');
  if (typeof any === 'string') return any;
  if (typeof all === 'string') return all;
  if (typeof none === 'string') return none;
  return Object.freeze({ any, all, none });
}

function isPassId(value: unknown): value is MissionPassId {
  return typeof value === 'string'
    && MISSION_PASS_IDS.some((pass) => pass === value);
}

function isStrength(value: unknown): value is PolicyStrength {
  return value === 'advisory' || value === 'required' || value === 'blocking';
}

function parseRule(value: unknown, index: number): PolicyRule | string {
  const raw = record(value);
  if (raw === undefined) return `rules[${index}] must be a plain object`;
  const allowed = new Set(['id', 'pass', 'strength', 'baseline', 'appliesWhen']);
  const extra = unknownField(raw, allowed);
  if (extra !== undefined) return `rules[${index}] has unknown field '${extra}'`;
  if (!label(raw['id'], 3, 128) || !POLICY_ID.test(raw['id'])) {
    return `rules[${index}].id must be a namespaced ID`;
  }
  if (!isPassId(raw['pass'])) return `rules[${index}].pass is not a known pass`;
  if (!isStrength(raw['strength'])) return `rules[${index}].strength is invalid`;
  if (raw['baseline'] !== undefined && typeof raw['baseline'] !== 'boolean') {
    return `rules[${index}].baseline must be boolean`;
  }
  const appliesWhen = parsePredicate(raw['appliesWhen']);
  if (typeof appliesWhen === 'string') return `rules[${index}].${appliesWhen}`;
  return Object.freeze({
    id: raw['id'],
    pass: raw['pass'],
    strength: raw['strength'],
    baseline: raw['baseline'] === true,
    appliesWhen,
  });
}

function parseWaiver(value: unknown, index: number): PolicyWaiver | string {
  const raw = record(value);
  if (raw === undefined) return `waivers[${index}] must be a plain object`;
  const allowed = new Set([
    'id',
    'ruleId',
    'reason',
    'approvedBy',
    'approvedAt',
    'expiresAt',
  ]);
  const extra = unknownField(raw, allowed);
  if (extra !== undefined) return `waivers[${index}] has unknown field '${extra}'`;
  if (!label(raw['id'], 3, 128) || !POLICY_ID.test(raw['id'])) {
    return `waivers[${index}].id must be a namespaced ID`;
  }
  if (!label(raw['ruleId'], 3, 128) || !POLICY_ID.test(raw['ruleId'])) {
    return `waivers[${index}].ruleId must be a namespaced ID`;
  }
  if (!label(raw['reason'], 10, 500)) return `waivers[${index}].reason is invalid`;
  if (!label(raw['approvedBy'], 1, 100)) {
    return `waivers[${index}].approvedBy is invalid`;
  }
  if (!label(raw['approvedAt'], 20, 24) || !UTC_DATE.test(raw['approvedAt'])) {
    return `waivers[${index}].approvedAt must be an ISO UTC timestamp`;
  }
  if (!label(raw['expiresAt'], 20, 24) || !UTC_DATE.test(raw['expiresAt'])) {
    return `waivers[${index}].expiresAt must be an ISO UTC timestamp`;
  }
  if (Date.parse(raw['expiresAt']) <= Date.parse(raw['approvedAt'])) {
    return `waivers[${index}].expiresAt must be after approvedAt`;
  }
  return Object.freeze({
    id: raw['id'],
    ruleId: raw['ruleId'],
    reason: raw['reason'],
    approvedBy: raw['approvedBy'],
    approvedAt: raw['approvedAt'],
    expiresAt: raw['expiresAt'],
  });
}

function parseItems<T>(
  value: unknown,
  maximum: number,
  field: string,
  parser: (item: unknown, index: number) => T | string,
): readonly T[] | string {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    return `${field} must contain 1 to ${maximum} entries`;
  }
  const parsed: T[] = [];
  for (const [index, item] of value.entries()) {
    const result = parser(item, index);
    if (typeof result === 'string') return result;
    parsed.push(result);
  }
  return Object.freeze(parsed);
}

function parseWaivers(value: unknown): readonly PolicyWaiver[] | string {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_POLICY_WAIVERS) {
    return `waivers must contain at most ${MAX_POLICY_WAIVERS} entries`;
  }
  const parsed: PolicyWaiver[] = [];
  for (const [index, item] of value.entries()) {
    const waiver = parseWaiver(item, index);
    if (typeof waiver === 'string') return waiver;
    parsed.push(waiver);
  }
  return Object.freeze(parsed);
}

function hasDuplicates(values: readonly { readonly id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size !== values.length;
}

function isLayer(value: unknown): value is PolicyLayer {
  return value === 'core'
    || value === 'profile'
    || value === 'organization'
    || value === 'project';
}

export function parsePolicy(value: unknown): PolicyParseResult {
  const raw = record(value);
  if (raw === undefined) return invalid('policy must be a plain object');
  const allowed = new Set(['schemaVersion', 'id', 'version', 'layer', 'rules', 'waivers']);
  const extra = unknownField(raw, allowed);
  if (extra !== undefined) return invalid(`unknown field '${extra}'`);
  if (raw['schemaVersion'] !== POLICY_SCHEMA_VERSION) {
    return invalid(`schemaVersion must be ${POLICY_SCHEMA_VERSION}`);
  }
  if (!label(raw['id'], 3, 128) || !POLICY_ID.test(raw['id'])) {
    return invalid('id must be a namespaced ID');
  }
  if (!Number.isSafeInteger(raw['version']) || Number(raw['version']) < 1) {
    return invalid('version must be a positive safe integer');
  }
  if (!isLayer(raw['layer'])) return invalid('layer is invalid');
  const rules = parseItems(raw['rules'], MAX_POLICY_RULES, 'rules', parseRule);
  if (typeof rules === 'string') return invalid(rules);
  const waivers = parseWaivers(raw['waivers']);
  if (typeof waivers === 'string') return invalid(waivers);
  if (hasDuplicates(rules)) return invalid('rules contain duplicate IDs');
  if (hasDuplicates(waivers)) return invalid('waivers contain duplicate IDs');
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      id: raw['id'],
      version: Number(raw['version']),
      layer: raw['layer'],
      rules,
      waivers,
    }),
  };
}
