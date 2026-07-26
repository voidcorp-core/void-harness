import { createHash } from 'node:crypto';
import type { JsonValue } from '../events/types.js';

const MAX_DEPTH = 32;
const MAX_NODES = 10_000;

interface Budget {
  nodes: number;
  readonly seen: WeakSet<object>;
}

function invalid(reason: string): never {
  throw new Error(`CANONICAL_JSON_INVALID: ${reason}`);
}

function normalize(value: unknown, depth: number, budget: Budget): JsonValue {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) invalid(`exceeds ${MAX_NODES} nodes`);
  if (depth > MAX_DEPTH) invalid(`exceeds depth ${MAX_DEPTH}`);
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('numbers must be finite');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') {
    invalid(`unsupported ${typeof value} value`);
  }
  if (budget.seen.has(value)) invalid('cyclic values are not supported');
  budget.seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => normalize(entry, depth + 1, budget));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid('objects must have a plain prototype');
    }
    const input = value as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = normalize(input[key], depth + 1, budget);
    }
    return output;
  } finally {
    budget.seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(
    normalize(value, 0, { nodes: 0, seen: new WeakSet() }),
  );
}

export function canonicalJsonHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
