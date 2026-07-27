export type NodeType = 'skill' | 'agent' | 'hook' | 'command' | 'pack' | 'profile' | 'workflow-def';
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

/**
 * Per-runtime enforcement tier for a capability (spec Fork 1, two-tier enforcement).
 * `pretooluse` = deep in-session block where the runtime supports it (Claude/Codex);
 * `active` = the skill runs but has no in-session enforcing hook;
 * `ci-only` = only the runtime-agnostic CI floor applies (e.g. Hermes);
 * `n/a` = the runtime cannot host the capability at all.
 */
export type EnforcementTier = 'pretooluse' | 'active' | 'ci-only' | 'n/a';

/** Declared enforcement (frontmatter). `floor` is the CI floor every runtime inherits; `inline`
 * is the per-runtime in-session tier. A capability's enforcement is honest per runtime, never masked. */
export interface NodeEnforcement {
  readonly floor: 'ci';
  readonly inline?: Readonly<Record<string, EnforcementTier>>;
}

/** A declared eval cell: the `(runtime, provider, tier)` a capability is certified/exercised on
 * (frontmatter `eval_targets:`, slug-encoded `runtime/provider/tier`). Drives which cells the
 * certification manifest (Phase A step A4) may mark `effective`. */
export interface EvalTarget {
  readonly runtime: string;
  readonly provider: string;
  readonly tier: string;
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
  /** Accountable maintainer (frontmatter `owner:`). Governance: a capability (skill) with no
   * owner is a blocking `missing-owner` finding — no capacity without a proof of ownership. */
  readonly owner?: string;
  /** Runtimes this capability declares it supports (frontmatter `runtimes:`). Governance: a skill
   * with no declared runtimes is a blocking `missing-runtimes` finding. Drives the runtime matrix. */
  readonly runtimes?: readonly string[];
  /** Declared per-runtime enforcement (frontmatter `enforcement:`). See NodeEnforcement. */
  readonly enforcement?: NodeEnforcement;
  /** Declared eval cells (frontmatter `eval_targets:`). See EvalTarget. */
  readonly evalTargets?: readonly EvalTarget[];
  /** Human-readable "what good looks like" signal (frontmatter `success_signal:`). Optional metadata. */
  readonly successSignal?: string;
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
