export type NodeType = 'skill' | 'agent' | 'hook' | 'command' | 'pack' | 'workflow-def';
export type EdgeKind =
  | 'routes-to'
  | 'composes'
  | 'conflicts'
  | 'overlaps'
  | 'companion-of'
  | 'invokes'
  | 'extends';
export type EdgeOrigin = 'derived' | 'declared';

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly name: string;
  readonly description: string;
  readonly lines: number;
  readonly pack: string | null; // allow-null: library boundary (pack optional for core nodes)
  readonly source: string;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly origin: EdgeOrigin;
  readonly evidence: string;
}

export interface GraphModel {
  readonly version: 1;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Stable node id: `type:name` for core, `type:pack/name` for a pack-scoped node. */
export function nodeId(type: NodeType, name: string, pack: string | null): string { // allow-null: library boundary (pack optional)
  return pack ? `${type}:${pack}/${name}` : `${type}:${name}`;
}
