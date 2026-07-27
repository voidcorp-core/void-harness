import { posix } from 'node:path';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types.js';

const NODE_KEYS = new Set([
  'id', 'type', 'name', 'description', 'lines', 'staticTokens', 'pack', 'source',
  'triggers', 'activation', 'owner', 'runtimes', 'enforcement', 'evalTargets', 'successSignal',
]);
const EDGE_KEYS = new Set(['from', 'to', 'kind', 'origin', 'evidence']);
const NODE_TYPES = new Set(['skill', 'agent', 'hook', 'command', 'pack', 'profile', 'workflow-def']);
const EDGE_KINDS = new Set([
  'routes-to', 'composes', 'conflicts', 'overlaps', 'companion-of', 'invokes', 'extends', 'enforces',
]);

function invalid(message: string): never {
  throw new Error(`GRAPH_V1_INVALID: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(`${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(`${path} must have a plain prototype`);
  return value as Record<string, unknown>;
}

function printable(value: unknown, path: string, maximum = 2_048): string {
  if (
    typeof value !== 'string'
    || value.length > maximum
    || [...value].some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 0x20 || point === 0x7f;
    })
  ) invalid(`${path} must be a bounded printable string`);
  return value;
}

function safePath(value: string): boolean {
  return value === '' || (
    !value.startsWith('/')
    && !/^[A-Za-z]:\//.test(value)
    && !value.includes('\\')
    && value !== '..'
    && !value.startsWith('../')
    && !value.includes('/../')
    && posix.normalize(value) === value
  );
}

function parseNode(value: unknown, index: number): GraphNode {
  const input = record(value, `nodes[${index}]`);
  const unknown = Object.keys(input).find((key) => !NODE_KEYS.has(key));
  if (unknown !== undefined) invalid(`nodes[${index}].${unknown} is unknown`);
  const id = printable(input['id'], `nodes[${index}].id`, 320);
  if (id.length === 0 || !id.includes(':') || id.includes('..')) invalid(`nodes[${index}].id is invalid`);
  const source = printable(input['source'], `nodes[${index}].source`);
  if (!safePath(source)) invalid(`nodes[${index}].source escapes the project root`);
  if (!Number.isSafeInteger(input['lines']) || (input['lines'] as number) < 0) {
    invalid(`nodes[${index}].lines is invalid`);
  }
  if (typeof input['type'] !== 'string' || !NODE_TYPES.has(input['type'])) {
    invalid(`nodes[${index}].type is invalid`);
  }
  if (printable(input['name'], `nodes[${index}].name`, 256).length === 0) {
    invalid(`nodes[${index}].name is empty`);
  }
  printable(input['description'], `nodes[${index}].description`, 10_000);
  if (
    input['pack'] !== null
    && (typeof input['pack'] !== 'string' || input['pack'].length === 0)
  ) invalid(`nodes[${index}].pack is invalid`);
  if (
    input['staticTokens'] !== undefined
    && (!Number.isSafeInteger(input['staticTokens']) || (input['staticTokens'] as number) < 0)
  ) invalid(`nodes[${index}].staticTokens is invalid`);
  return Object.freeze({ ...input, id, source }) as unknown as GraphNode;
}

function parseEdge(value: unknown, index: number): GraphEdge {
  const input = record(value, `edges[${index}]`);
  const unknown = Object.keys(input).find((key) => !EDGE_KEYS.has(key));
  if (unknown !== undefined) invalid(`edges[${index}].${unknown} is unknown`);
  const edge = Object.freeze({
    from: printable(input['from'], `edges[${index}].from`, 320),
    to: printable(input['to'], `edges[${index}].to`, 320),
    kind: printable(input['kind'], `edges[${index}].kind`, 64),
    origin: printable(input['origin'], `edges[${index}].origin`, 16),
    evidence: printable(input['evidence'], `edges[${index}].evidence`),
  }) as GraphEdge;
  if (!EDGE_KINDS.has(edge.kind)) invalid(`edges[${index}].kind is invalid`);
  if (edge.origin !== 'declared' && edge.origin !== 'derived') {
    invalid(`edges[${index}].origin is invalid`);
  }
  return edge;
}

export function parseCatalogV1(value: unknown): GraphModel {
  const input = record(value, '$');
  const unknown = Object.keys(input).find((key) => !['version', 'nodes', 'edges'].includes(key));
  if (unknown !== undefined) invalid(`$.${unknown} is unknown`);
  if (input['version'] !== 1) invalid('$.version must equal 1');
  if (!Array.isArray(input['nodes']) || input['nodes'].length > 50_000) invalid('$.nodes exceeds its limit');
  if (!Array.isArray(input['edges']) || input['edges'].length > 200_000) invalid('$.edges exceeds its limit');
  const nodes = Object.freeze(input['nodes'].map(parseNode));
  const edges = Object.freeze(input['edges'].map(parseEdge));
  const ids = nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) invalid('$.nodes contains duplicate IDs');
  const known = new Set(ids);
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) invalid(`edge '${edge.from}->${edge.to}' is dangling`);
  }
  return Object.freeze({ version: 1, nodes, edges });
}
