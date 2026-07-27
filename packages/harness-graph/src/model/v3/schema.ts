import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import {
  GRAPH_SCHEMA_VERSION,
  type GraphDeltaV3,
  type GraphEdgeV3,
  type GraphHyperedgeV3,
  type GraphJsonValue,
  type GraphNodeV3,
  type GraphParseResult,
  type GraphProvenance,
  type GraphProvenancePointer,
  type GraphSnapshotDraft,
  type GraphSnapshotV3,
  type GraphSource,
  type GraphSourceDescriptor,
  type GraphType,
} from './types.js';

export const MAX_GRAPH_BYTES = 16 * 1024 * 1024;
export const MAX_GRAPH_NODES = 50_000;
export const MAX_GRAPH_EDGES = 200_000;
export const MAX_GRAPH_HYPEREDGES = 20_000;

const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]*:[A-Za-z0-9._~:/-]{1,300}$/;
const KIND = /^[a-z][a-z0-9-]{0,63}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const GRAPH_TYPES = new Set<GraphType>(['catalog', 'project', 'mission', 'evidence']);
const SOURCE_KINDS = new Set(['native', 'adapter', 'import']);
const ORIGINS = new Set(['declared', 'extracted', 'observed', 'inferred']);
const POINTER_KINDS = new Set(['path', 'contract', 'event', 'adapter']);

interface JsonBudget { nodes: number; readonly seen: WeakSet<object> }

function validUtcTimestamp(value: string): boolean {
  if (!ISO_UTC.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(timestamp).toISOString() === normalized;
}

function graphError(message: string): never {
  throw new Error(`GRAPH_V3_INVALID: ${message}`);
}

function record(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return graphError(`${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return graphError(`${path} must have a plain prototype`);
  }
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown !== undefined) graphError(`${path}.${unknown} is unknown`);
  return input;
}

function label(value: unknown, path: string, maximum = 512): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximum
    || [...value].some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 0x20 || point === 0x7f;
    })
  ) {
    return graphError(`${path} must be a bounded printable string`);
  }
  return value;
}

function id(value: unknown, path: string): string {
  const result = label(value, path, 320);
  if (!ID.test(result) || result.includes('..')) graphError(`${path} must be a safe namespaced ID`);
  return result;
}

function kind(value: unknown, path: string): string {
  const result = label(value, path, 64);
  if (!KIND.test(result)) graphError(`${path} must be a lower-case kind`);
  return result;
}

function hash(value: unknown, path: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) graphError(`${path} must be a SHA-256 hash`);
  return value;
}

function json(value: unknown, path: string, depth: number, budget: JsonBudget): GraphJsonValue {
  budget.nodes += 1;
  if (budget.nodes > 1_000_000) graphError('JSON payload exceeds one million values');
  if (depth > 24) graphError(`${path} exceeds JSON depth 24`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) graphError(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') return graphError(`${path} contains unsupported ${typeof value}`);
  if (budget.seen.has(value)) graphError(`${path} contains a cycle`);
  budget.seen.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item, index) => json(item, `${path}[${index}]`, depth + 1, budget)));
    }
    const input = record(value, path, Object.keys(value));
    return Object.freeze(Object.fromEntries(Object.keys(input).sort().map((key) =>
      [key, json(input[key], `${path}.${key}`, depth + 1, budget)])));
  } finally {
    budget.seen.delete(value);
  }
}

function data(value: unknown, path: string, budget: JsonBudget): Readonly<Record<string, GraphJsonValue>> {
  const parsed = json(value, path, 0, budget);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return graphError(`${path} must be a JSON object`);
  }
  return parsed as Readonly<Record<string, GraphJsonValue>>;
}

function safeRelativePath(value: string): boolean {
  return !value.startsWith('/')
    && !/^[A-Za-z]:\//.test(value)
    && !value.includes('\\')
    && value !== '..'
    && !value.startsWith('../')
    && !value.includes('/../')
    && posix.normalize(value) === value;
}

function pointer(value: unknown, path: string): GraphProvenancePointer {
  const input = record(value, path, ['kind', 'ref', 'hashOrVersion']);
  const pointerKind = label(input['kind'], `${path}.kind`, 16);
  if (!POINTER_KINDS.has(pointerKind)) graphError(`${path}.kind is invalid`);
  const ref = label(input['ref'], `${path}.ref`, 1_024);
  if (pointerKind === 'path' && !safeRelativePath(ref)) graphError(`${path}.ref escapes the project root`);
  return Object.freeze({
    kind: pointerKind as GraphProvenancePointer['kind'],
    ref,
    hashOrVersion: label(input['hashOrVersion'], `${path}.hashOrVersion`, 128),
  });
}

function provenance(value: unknown, path: string): GraphProvenance {
  const input = record(value, path, ['origin', 'confidence', 'sources', 'observedAt']);
  const origin = label(input['origin'], `${path}.origin`, 16);
  if (!ORIGINS.has(origin)) graphError(`${path}.origin is invalid`);
  if (
    typeof input['confidence'] !== 'number'
    || !Number.isFinite(input['confidence'])
    || input['confidence'] < 0
    || input['confidence'] > 1
  ) {
    graphError(`${path}.confidence must be between 0 and 1`);
  }
  if (!Array.isArray(input['sources']) || input['sources'].length === 0 || input['sources'].length > 16) {
    graphError(`${path}.sources must contain 1 to 16 entries`);
  }
  const sources = Object.freeze(input['sources'].map((item, index) =>
    pointer(item, `${path}.sources[${index}]`)));
  const observedAt = input['observedAt'];
  if (origin === 'observed') {
    if (
      typeof observedAt !== 'string'
      || !validUtcTimestamp(observedAt)
    ) graphError(`${path}.observedAt is required for observed provenance`);
  } else if (observedAt !== undefined) {
    graphError(`${path}.observedAt is forbidden unless origin is observed`);
  }
  return Object.freeze({
    origin: origin as GraphProvenance['origin'],
    confidence: input['confidence'],
    sources,
    ...(typeof observedAt === 'string' ? { observedAt } : {}),
  });
}

function sourceDescriptor(value: unknown, path: string): GraphSourceDescriptor {
  const input = record(value, path, ['kind', 'version']);
  const sourceKind = label(input['kind'], `${path}.kind`, 16);
  if (!SOURCE_KINDS.has(sourceKind)) graphError(`${path}.kind is invalid`);
  return Object.freeze({
    kind: sourceKind as GraphSourceDescriptor['kind'],
    version: label(input['version'], `${path}.version`, 128),
  });
}

function source(value: unknown, path: string): GraphSource {
  const input = record(value, path, ['kind', 'version', 'rootHash']);
  const descriptor = sourceDescriptor({ kind: input['kind'], version: input['version'] }, path);
  return Object.freeze({ ...descriptor, rootHash: hash(input['rootHash'], `${path}.rootHash`) });
}

function node(value: unknown, path: string, budget: JsonBudget): GraphNodeV3 {
  const input = record(value, path, ['id', 'kind', 'label', 'data', 'provenance']);
  return Object.freeze({
    id: id(input['id'], `${path}.id`),
    kind: kind(input['kind'], `${path}.kind`),
    label: label(input['label'], `${path}.label`),
    data: data(input['data'], `${path}.data`, budget),
    provenance: provenance(input['provenance'], `${path}.provenance`),
  });
}

function edge(value: unknown, path: string, budget: JsonBudget): GraphEdgeV3 {
  const input = record(value, path, ['id', 'from', 'to', 'kind', 'data', 'provenance']);
  return Object.freeze({
    id: id(input['id'], `${path}.id`),
    from: id(input['from'], `${path}.from`),
    to: id(input['to'], `${path}.to`),
    kind: kind(input['kind'], `${path}.kind`),
    data: data(input['data'], `${path}.data`, budget),
    provenance: provenance(input['provenance'], `${path}.provenance`),
  });
}

function hyperedge(value: unknown, path: string, budget: JsonBudget): GraphHyperedgeV3 {
  const input = record(value, path, ['id', 'members', 'kind', 'data', 'provenance']);
  if (!Array.isArray(input['members']) || input['members'].length < 2 || input['members'].length > 256) {
    graphError(`${path}.members must contain 2 to 256 IDs`);
  }
  const members = Object.freeze(input['members'].map((item, index) => id(item, `${path}.members[${index}]`)));
  if (new Set(members).size !== members.length) graphError(`${path}.members contains duplicates`);
  return Object.freeze({
    id: id(input['id'], `${path}.id`),
    members,
    kind: kind(input['kind'], `${path}.kind`),
    data: data(input['data'], `${path}.data`, budget),
    provenance: provenance(input['provenance'], `${path}.provenance`),
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const input = value as Record<string, unknown>;
    return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rootPayload(graph: GraphSnapshotDraft | GraphSnapshotV3): unknown {
  return {
    schemaVersion: graph.schemaVersion,
    graphId: graph.graphId,
    graphType: graph.graphType,
    source: { kind: graph.source.kind, version: graph.source.version },
    nodes: graph.nodes,
    edges: graph.edges,
    hyperedges: graph.hyperedges,
  };
}

export function graphRootHash(graph: GraphSnapshotDraft | GraphSnapshotV3): string {
  return `sha256:${createHash('sha256').update(stableJson(rootPayload(graph))).digest('hex')}`;
}

function parseSnapshot(value: unknown, verifyHash: boolean): GraphSnapshotV3 {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return graphError('snapshot is not serializable JSON');
  }
  if (bytes > MAX_GRAPH_BYTES) graphError(`snapshot exceeds ${MAX_GRAPH_BYTES} bytes`);
  const input = record(value, '$', ['schemaVersion', 'graphId', 'graphType', 'source', 'nodes', 'edges', 'hyperedges']);
  if (input['schemaVersion'] !== GRAPH_SCHEMA_VERSION) graphError('$.schemaVersion must equal 3');
  const graphType = label(input['graphType'], '$.graphType', 16);
  if (!GRAPH_TYPES.has(graphType as GraphType)) graphError('$.graphType is invalid');
  const graphId = id(input['graphId'], '$.graphId');
  if (!graphId.startsWith(`${graphType}:`)) graphError('$.graphId must use the graphType namespace');
  if (!Array.isArray(input['nodes']) || input['nodes'].length > MAX_GRAPH_NODES) graphError('$.nodes exceeds its limit');
  if (!Array.isArray(input['edges']) || input['edges'].length > MAX_GRAPH_EDGES) graphError('$.edges exceeds its limit');
  if (!Array.isArray(input['hyperedges']) || input['hyperedges'].length > MAX_GRAPH_HYPEREDGES) graphError('$.hyperedges exceeds its limit');
  const budget: JsonBudget = { nodes: 0, seen: new WeakSet() };
  const nodes = Object.freeze(input['nodes'].map((item, index) => node(item, `$.nodes[${index}]`, budget)));
  const edges = Object.freeze(input['edges'].map((item, index) => edge(item, `$.edges[${index}]`, budget)));
  const hyperedges = Object.freeze(input['hyperedges'].map((item, index) => hyperedge(item, `$.hyperedges[${index}]`, budget)));
  for (const [path, entries] of [['nodes', nodes], ['edges', edges], ['hyperedges', hyperedges]] as const) {
    const ids = entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) graphError(`$.${path} contains duplicate IDs`);
    if (ids.some((entry, index) => {
      const previous = index === 0 ? undefined : ids[index - 1];
      return previous !== undefined && entry.localeCompare(previous) < 0;
    })) {
      graphError(`$.${path} must be sorted by ID`);
    }
  }
  const allIds = [...nodes, ...edges, ...hyperedges].map((entry) => entry.id);
  if (new Set(allIds).size !== allIds.length) graphError('entity IDs collide across graph collections');
  const nodeIds = new Set(nodes.map((entry) => entry.id));
  for (const relation of edges) {
    if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) graphError(`edge '${relation.id}' is dangling`);
  }
  for (const relation of hyperedges) {
    if (relation.members.some((member) => !nodeIds.has(member))) graphError(`hyperedge '${relation.id}' is dangling`);
  }
  const parsed = Object.freeze({
    schemaVersion: GRAPH_SCHEMA_VERSION,
    graphId,
    graphType: graphType as GraphType,
    source: source(input['source'], '$.source'),
    nodes,
    edges,
    hyperedges,
  });
  if (verifyHash && graphRootHash(parsed) !== parsed.source.rootHash) graphError('$.source.rootHash does not match graph content');
  return parsed;
}

export function parseGraphSnapshot(value: unknown): GraphParseResult<GraphSnapshotV3> {
  try {
    return Object.freeze({ ok: true, value: parseSnapshot(value, true) });
  } catch (error) {
    return Object.freeze({
      ok: false,
      issue: Object.freeze({
        code: 'invalid-graph' as const,
        message: error instanceof Error ? error.message : String(error),
      }),
    });
  }
}

export function assertGraphSnapshot(value: unknown): GraphSnapshotV3 {
  const parsed = parseGraphSnapshot(value);
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

export function sealGraphSnapshot(draft: GraphSnapshotDraft): GraphSnapshotV3 {
  const sorted: GraphSnapshotDraft = {
    ...draft,
    nodes: Object.freeze([...draft.nodes].sort((a, b) => a.id.localeCompare(b.id))),
    edges: Object.freeze([...draft.edges].sort((a, b) => a.id.localeCompare(b.id))),
    hyperedges: Object.freeze([...draft.hyperedges].sort((a, b) => a.id.localeCompare(b.id))),
  };
  return assertGraphSnapshot({
    ...sorted,
    source: { ...sorted.source, rootHash: graphRootHash(sorted) },
  });
}

export function serializeGraphSnapshot(graph: GraphSnapshotV3): string {
  return `${JSON.stringify(assertGraphSnapshot(graph), null, 2)}\n`;
}

function stringIds(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_GRAPH_EDGES) graphError(`${path} exceeds its limit`);
  const ids = Object.freeze(value.map((item, index) => id(item, `${path}[${index}]`)));
  if (new Set(ids).size !== ids.length) graphError(`${path} contains duplicates`);
  return ids;
}

function parseDelta(value: unknown): GraphDeltaV3 {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return graphError('delta is not serializable JSON');
  }
  if (bytes > MAX_GRAPH_BYTES) graphError(`delta exceeds ${MAX_GRAPH_BYTES} bytes`);
  const input = record(value, '$', [
    'schemaVersion', 'kind', 'graphId', 'graphType', 'source', 'baseRootHash', 'rootHash',
    'upsertNodes', 'removeNodeIds', 'upsertEdges', 'removeEdgeIds',
    'upsertHyperedges', 'removeHyperedgeIds',
  ]);
  if (input['schemaVersion'] !== 3 || input['kind'] !== 'delta') graphError('delta contract is invalid');
  const graphType = label(input['graphType'], '$.graphType', 16) as GraphType;
  if (!GRAPH_TYPES.has(graphType)) graphError('$.graphType is invalid');
  const graphId = id(input['graphId'], '$.graphId');
  if (!graphId.startsWith(`${graphType}:`)) graphError('$.graphId must use the graphType namespace');
  const budget: JsonBudget = { nodes: 0, seen: new WeakSet() };
  const parseList = <T>(raw: unknown, path: string, maximum: number, parser: (item: unknown, path: string, budget: JsonBudget) => T): readonly T[] => {
    if (!Array.isArray(raw) || raw.length > maximum) graphError(`${path} exceeds its limit`);
    const items = Object.freeze(raw.map((item, index) => parser(item, `${path}[${index}]`, budget)));
    const ids = items.map((item) => (item as { readonly id: string }).id);
    if (new Set(ids).size !== ids.length) graphError(`${path} contains duplicate IDs`);
    return items;
  };
  const delta = Object.freeze({
    schemaVersion: 3 as const,
    kind: 'delta' as const,
    graphId,
    graphType,
    source: sourceDescriptor(input['source'], '$.source'),
    baseRootHash: hash(input['baseRootHash'], '$.baseRootHash'),
    rootHash: hash(input['rootHash'], '$.rootHash'),
    upsertNodes: parseList(input['upsertNodes'], '$.upsertNodes', MAX_GRAPH_NODES, node),
    removeNodeIds: stringIds(input['removeNodeIds'], '$.removeNodeIds'),
    upsertEdges: parseList(input['upsertEdges'], '$.upsertEdges', MAX_GRAPH_EDGES, edge),
    removeEdgeIds: stringIds(input['removeEdgeIds'], '$.removeEdgeIds'),
    upsertHyperedges: parseList(input['upsertHyperedges'], '$.upsertHyperedges', MAX_GRAPH_HYPEREDGES, hyperedge),
    removeHyperedgeIds: stringIds(input['removeHyperedgeIds'], '$.removeHyperedgeIds'),
  });
  const collision = [
    [delta.upsertNodes, delta.removeNodeIds],
    [delta.upsertEdges, delta.removeEdgeIds],
    [delta.upsertHyperedges, delta.removeHyperedgeIds],
  ].some(([upserts, removals]) => {
    const removed = new Set(removals as readonly string[]);
    return (upserts as readonly { readonly id: string }[]).some((item) => removed.has(item.id));
  });
  if (collision) graphError('delta cannot upsert and remove the same ID');
  return delta;
}

export function parseGraphDelta(value: unknown): GraphParseResult<GraphDeltaV3> {
  try {
    return Object.freeze({ ok: true, value: parseDelta(value) });
  } catch (error) {
    return Object.freeze({
      ok: false,
      issue: Object.freeze({
        code: 'invalid-graph' as const,
        message: error instanceof Error ? error.message : String(error),
      }),
    });
  }
}

function applyById<T extends { readonly id: string }>(
  current: readonly T[],
  upserts: readonly T[],
  removals: readonly string[],
): readonly T[] {
  const values = new Map(current.map((item) => [item.id, item]));
  for (const id of removals) values.delete(id);
  for (const item of upserts) values.set(item.id, item);
  return Object.freeze([...values.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

export function applyGraphDelta(snapshot: GraphSnapshotV3, rawDelta: GraphDeltaV3): GraphSnapshotV3 {
  const base = assertGraphSnapshot(snapshot);
  const parsed = parseGraphDelta(rawDelta);
  if (!parsed.ok) throw new Error(parsed.issue.message);
  const delta = parsed.value;
  if (
    delta.graphId !== base.graphId
    || delta.graphType !== base.graphType
    || delta.baseRootHash !== base.source.rootHash
  ) {
    throw new Error('GRAPH_DELTA_BASE_MISMATCH: delta does not target the supplied snapshot');
  }
  return assertGraphSnapshot({
    schemaVersion: 3,
    graphId: base.graphId,
    graphType: base.graphType,
    source: { ...delta.source, rootHash: delta.rootHash },
    nodes: applyById(base.nodes, delta.upsertNodes, delta.removeNodeIds),
    edges: applyById(base.edges, delta.upsertEdges, delta.removeEdgeIds),
    hyperedges: applyById(base.hyperedges, delta.upsertHyperedges, delta.removeHyperedgeIds),
  });
}
