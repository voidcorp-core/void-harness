import { parseCatalogV1 } from '../compat/v1-schema.js';
import type { GraphModel } from '../model/types.js';
import { graphEntityId, graphRelationId } from '../model/v3/ids.js';
import {
  declaredProvenance,
  extractedProvenance,
} from '../model/v3/provenance.js';
import { sealGraphSnapshot } from '../model/v3/schema.js';
import {
  GRAPH_CONTRACT_VERSION,
  type GraphJsonValue,
  type GraphProvenancePointer,
  type GraphSnapshotV3,
} from '../model/v3/types.js';

function jsonRecord(value: unknown): Readonly<Record<string, GraphJsonValue>> {
  return JSON.parse(JSON.stringify(value)) as Readonly<Record<string, GraphJsonValue>>;
}

function nodePointer(source: string): GraphProvenancePointer {
  return source === ''
    ? { kind: 'adapter', ref: 'catalog-v1', hashOrVersion: '1' }
    : { kind: 'path', ref: source, hashOrVersion: 'catalog-v1' };
}

function requiredId(ids: ReadonlyMap<string, string>, legacyId: string): string {
  const mapped = ids.get(legacyId);
  if (mapped === undefined) {
    throw new Error(`GRAPH_V1_INVALID: missing mapped identity for '${legacyId}'`);
  }
  return mapped;
}

export function buildCatalogGraph(rawModel: GraphModel): GraphSnapshotV3 {
  const model = parseCatalogV1(rawModel);
  const nodeIds = new Map(model.nodes.map((node) => [
    node.id,
    graphEntityId('catalog', node.type, node.id),
  ]));
  const nodes = model.nodes.map((node) => ({
    id: requiredId(nodeIds, node.id),
    kind: node.type,
    label: node.name,
    data: { legacy: jsonRecord(node) },
    provenance: extractedProvenance(nodePointer(node.source)),
  }));
  const edges = model.edges.map((edge) => {
    const from = requiredId(nodeIds, edge.from);
    const to = requiredId(nodeIds, edge.to);
    return {
      id: graphRelationId('catalog', edge.kind, [
        from,
        to,
        edge.origin,
        edge.evidence,
      ]),
      from,
      to,
      kind: edge.kind,
      data: { legacy: jsonRecord(edge) },
      provenance: edge.origin === 'declared'
        ? declaredProvenance({ kind: 'contract', ref: 'relations:v1', hashOrVersion: '1' })
        : extractedProvenance({ kind: 'adapter', ref: 'catalog-v1', hashOrVersion: '1' }),
    };
  });
  return sealGraphSnapshot({
    schemaVersion: 3,
    graphId: 'catalog:void-harness',
    graphType: 'catalog',
    source: { kind: 'adapter', version: GRAPH_CONTRACT_VERSION },
    nodes,
    edges,
    hyperedges: [],
  });
}
