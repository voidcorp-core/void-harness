export type NodeType = 'skill' | 'agent' | 'hook' | 'command' | 'pack' | 'workflow-def';
export type EdgeKind =
  | 'routes-to'
  | 'composes'
  | 'conflicts'
  | 'overlaps'
  | 'companion-of'
  | 'invokes'
  | 'extends'
  | 'enforces';
export type EdgeOrigin = 'derived' | 'declared';

/**
 * How a component earns its place in the graph.
 * `always` = doctrine followed passively (its rule applies via PHILOSOPHY + enforcing hooks,
 * without being invoked through the Skill tool), so `invocations: 0` is NOT a death signal.
 * `on-demand` = a workflow triggered actively; if never invoked, a low-count IS a real signal.
 * Absent frontmatter defaults to on-demand (the historical behavior).
 */
export type NodeActivation = 'always' | 'on-demand';

/** Declared, machine-readable activation triggers (opt-in, frontmatter). Feeds the M8 should-have-fired analysis. */
export interface NodeTriggers {
  readonly globs?: readonly string[];
  readonly extensions?: readonly string[];
  readonly tools?: readonly string[];
}

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly name: string;
  readonly description: string;
  readonly lines: number;
  /** Estimated source tokens (chars/4), computed at build. Absent until a build populates it. */
  readonly staticTokens?: number;
  readonly pack: string | null; // allow-null: library boundary (pack optional for core nodes)
  readonly source: string;
  readonly triggers?: NodeTriggers;
  /** Declared activation mode (frontmatter). Absent = on-demand (default). See NodeActivation. */
  readonly activation?: NodeActivation;
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
