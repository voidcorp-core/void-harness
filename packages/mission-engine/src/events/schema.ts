import type {
  CanonicalEvent,
  EventParseResult,
  JsonValue,
} from './types.js';

export const MAX_EVENT_PAYLOAD_BYTES = 16 * 1024;
export const MAX_EVENT_LINE_BYTES = 32 * 1024;
export const MAX_EVENT_PAYLOAD_DEPTH = 8;
export const MAX_EVENT_PAYLOAD_NODES = 512;

const EVENT_ID = /^evt_[A-Za-z0-9_-]{8,100}$/;
const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EVENT_KIND = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;
const EVENT_KEYS = new Set([
  'schemaVersion',
  'seq',
  'eventId',
  'missionId',
  'ts',
  'source',
  'kind',
  'subject',
  'causationId',
  'correlationId',
  'payload',
]);

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function isPrintable(value: string): boolean {
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0;
    if (point < 0x20 || point === 0x7f) return false;
  }
  return true;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : undefined;
}

interface JsonBudget {
  nodes: number;
}

function isJsonValue(
  value: unknown,
  depth: number,
  budget: JsonBudget,
): value is JsonValue {
  budget.nodes += 1;
  if (
    depth > MAX_EVENT_PAYLOAD_DEPTH
    || budget.nodes > MAX_EVENT_PAYLOAD_NODES
  ) {
    return false;
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((entry) =>
      isJsonValue(entry, depth + 1, budget),
    );
  }
  const object = record(value);
  if (object === undefined) return false;
  return Object.entries(object).every(
    ([key, entry]) =>
      key.length <= 100
      && isPrintable(key)
      && isJsonValue(entry, depth + 1, budget),
  );
}

function boundedLabel(
  value: unknown,
  min: number,
  max: number,
  pattern?: RegExp,
): value is string {
  return typeof value === 'string'
    && value.length >= min
    && value.length <= max
    && isPrintable(value)
    && (pattern === undefined || pattern.test(value));
}

function contractError(message: string): EventParseResult {
  return {
    ok: false,
    issue: { code: 'invalid-event-contract', message },
  };
}

export function parseEvent(value: unknown): EventParseResult {
  const raw = record(value);
  if (raw === undefined) return contractError('event must be a plain object');
  const unknownKeys = Object.keys(raw).filter((key) => !EVENT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return contractError(`unknown field(s): ${unknownKeys.join(', ')}`);
  }
  if (raw['schemaVersion'] !== 1) return contractError('schemaVersion must be 1');
  if (
    typeof raw['seq'] !== 'number'
    || !Number.isSafeInteger(raw['seq'])
    || raw['seq'] <= 0
  ) {
    return contractError('seq must be a positive safe integer');
  }
  if (!boundedLabel(raw['eventId'], 12, 104, EVENT_ID)) {
    return contractError('eventId must be evt_<opaque-id>');
  }
  if (!boundedLabel(raw['missionId'], 12, 104, MISSION_ID)) {
    return contractError('missionId must be mis_<opaque-id>');
  }
  if (!boundedLabel(raw['ts'], 20, 24, DATE_TIME)) {
    return contractError('ts must be an ISO UTC timestamp');
  }
  if (!boundedLabel(raw['source'], 1, 128)) {
    return contractError('source must be a bounded label');
  }
  if (!boundedLabel(raw['kind'], 3, 128, EVENT_KIND)) {
    return contractError('kind must be a dotted event name');
  }
  if (!boundedLabel(raw['subject'], 1, 256)) {
    return contractError('subject must be a bounded label');
  }
  if (
    raw['causationId'] !== undefined
    && !boundedLabel(raw['causationId'], 12, 104, EVENT_ID)
  ) {
    return contractError('causationId must be evt_<opaque-id>');
  }
  if (!boundedLabel(raw['correlationId'], 12, 104, MISSION_ID)) {
    return contractError('correlationId must be mis_<opaque-id>');
  }
  if (!isJsonValue(raw['payload'], 0, { nodes: 0 })) {
    return contractError('payload must be bounded JSON data');
  }
  if (utf8Bytes(JSON.stringify(raw['payload'])) > MAX_EVENT_PAYLOAD_BYTES) {
    return contractError(`payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`);
  }

  const required = {
    schemaVersion: 1 as const,
    seq: raw['seq'],
    eventId: raw['eventId'],
    missionId: raw['missionId'],
    ts: raw['ts'],
    source: raw['source'],
    kind: raw['kind'],
    subject: raw['subject'],
    correlationId: raw['correlationId'],
    payload: raw['payload'],
  };
  return {
    ok: true,
    value: {
      ...required,
      ...(raw['causationId'] === undefined
        ? {}
        : { causationId: raw['causationId'] as string }),
    },
  };
}

export function parseEventLine(line: string): EventParseResult {
  if (utf8Bytes(line) > MAX_EVENT_LINE_BYTES) {
    return {
      ok: false,
      issue: {
        code: 'event-line-too-large',
        message: `event line exceeds ${MAX_EVENT_LINE_BYTES} bytes`,
      },
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: 'invalid-event-json',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  return parseEvent(raw);
}

export function serializeEvent(event: CanonicalEvent): string {
  const parsed = parseEvent(event);
  if (!parsed.ok) throw new Error(`EVENT_INVALID: ${parsed.issue.message}`);
  const line = JSON.stringify(parsed.value);
  if (utf8Bytes(line) > MAX_EVENT_LINE_BYTES) {
    throw new Error(`EVENT_LINE_TOO_LARGE: exceeds ${MAX_EVENT_LINE_BYTES} bytes`);
  }
  return line;
}
