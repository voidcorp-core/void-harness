export const GRAPH_SCHEMA_VERSION = 3 as const;
export const GRAPH_CONTRACT_VERSION = '3.0.0-alpha.1' as const;

export type GraphType = 'catalog' | 'project' | 'mission' | 'evidence';
export type GraphOrigin = 'declared' | 'extracted' | 'observed' | 'inferred';
export type GraphSourceKind = 'native' | 'adapter' | 'import';
export type GraphPointerKind = 'path' | 'contract' | 'event' | 'adapter';

export type GraphJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly GraphJsonValue[]
  | { readonly [key: string]: GraphJsonValue };

export interface GraphProvenancePointer {
  readonly kind: GraphPointerKind;
  readonly ref: string;
  readonly hashOrVersion: string;
}

export interface GraphProvenance {
  readonly origin: GraphOrigin;
  readonly confidence: number;
  readonly sources: readonly GraphProvenancePointer[];
  readonly observedAt?: string;
}

export interface GraphSourceDescriptor {
  readonly kind: GraphSourceKind;
  readonly version: string;
}

export interface GraphSource extends GraphSourceDescriptor {
  readonly rootHash: string;
}

export interface GraphNodeV3 {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly data: Readonly<Record<string, GraphJsonValue>>;
  readonly provenance: GraphProvenance;
}

export interface GraphEdgeV3 {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: string;
  readonly data: Readonly<Record<string, GraphJsonValue>>;
  readonly provenance: GraphProvenance;
}

export interface GraphHyperedgeV3 {
  readonly id: string;
  readonly members: readonly string[];
  readonly kind: string;
  readonly data: Readonly<Record<string, GraphJsonValue>>;
  readonly provenance: GraphProvenance;
}

export interface GraphSnapshotV3 {
  readonly schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  readonly graphId: string;
  readonly graphType: GraphType;
  readonly source: GraphSource;
  readonly nodes: readonly GraphNodeV3[];
  readonly edges: readonly GraphEdgeV3[];
  readonly hyperedges: readonly GraphHyperedgeV3[];
}

export interface GraphSnapshotDraft extends Omit<GraphSnapshotV3, 'source'> {
  readonly source: GraphSourceDescriptor;
}

export interface GraphDeltaV3 {
  readonly schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  readonly kind: 'delta';
  readonly graphId: string;
  readonly graphType: GraphType;
  readonly source: GraphSourceDescriptor;
  readonly baseRootHash: string;
  readonly rootHash: string;
  readonly upsertNodes: readonly GraphNodeV3[];
  readonly removeNodeIds: readonly string[];
  readonly upsertEdges: readonly GraphEdgeV3[];
  readonly removeEdgeIds: readonly string[];
  readonly upsertHyperedges: readonly GraphHyperedgeV3[];
  readonly removeHyperedgeIds: readonly string[];
}

export type GraphParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: { readonly code: 'invalid-graph'; readonly message: string } };
