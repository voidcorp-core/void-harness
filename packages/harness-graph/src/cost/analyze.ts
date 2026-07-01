import type { GraphModel, NodeType } from '../model/types.js';
import type { ActivationEvent, ActivationKind } from '../behavior/types.js';
import { FIRING_KIND, bareName, triggerMatches, within } from '../behavior/index.js';
import type { ActivationTrigger } from '../behavior/types.js';
import type { CostFlag, CostOptions, CostReport, CostRow, CostStats } from './types.js';

export * from './types.js';

const DEFAULT_MIN_SESSIONS = 3;
const DEFAULT_MIN_EVENTS = 20;
const DEFAULT_UNDERUSED_BELOW = 2;
const DEFAULT_LOW_YIELD_STATIC_MIN = 1500;

/** Node types that represent a harness component earning (or not) its place.
 * `pack` is a grouping, not a firing component, so it is excluded from cost rows. */
const COMPONENT_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'skill',
  'command',
  'agent',
  'workflow-def',
  'hook',
]);

/**
 * Attribute static token cost per harness component and flag the ones that do
 * not earn their place. Pure: no I/O, deterministic.
 *
 * Static cost = staticTokens x invocations (tokens the component actually
 * injected). Phase 2 adds a real signal from `opts.sessionCosts`; until then
 * every row is static-only (`realSignal`/`cacheReadRatio` absent).
 */
export function analyzeCost(
  model: GraphModel,
  activations: readonly ActivationEvent[],
  opts: CostOptions = {},
): CostReport {
  const minSessions = opts.minSessions ?? DEFAULT_MIN_SESSIONS;
  const minEvents = opts.minEvents ?? DEFAULT_MIN_EVENTS;
  const underusedBelow = opts.underusedBelow ?? DEFAULT_UNDERUSED_BELOW;
  const lowYieldStaticMin = opts.lowYieldStaticMin ?? DEFAULT_LOW_YIELD_STATIC_MIN;

  const scoped = activations.filter((e) => within(e, opts.sinceMs));
  const sessions = new Set(scoped.map((e) => e.sessionId));
  const stats: CostStats = { events: scoped.length, sessions: sessions.size, skippedTranscriptLines: 0 };
  // Always static-only until phase 2 (Step 7) branches on opts.sessionCosts to
  // attach realSignal and switch this to 'full'. Kept explicit for that seam.
  const mode = 'static-only' as const;

  if (stats.sessions < minSessions || stats.events < minEvents) {
    return { sufficient: false, stats, rows: [], mode };
  }

  // invocations[kind][bareName] = count of firing activations.
  const firedCount = new Map<ActivationKind, Map<string, number>>();
  // Tool-use situations observed (the meter's PreToolUse * events). A hook fires
  // deterministically when its tool matcher matches one of these.
  const situations: ActivationTrigger[] = [];
  for (const e of scoped) {
    let byName = firedCount.get(e.kind);
    if (!byName) {
      byName = new Map();
      firedCount.set(e.kind, byName);
    }
    const name = bareName(e.name);
    byName.set(name, (byName.get(name) ?? 0) + 1);
    if (e.kind === 'tool') situations.push(e.trigger);
  }

  const rows: CostRow[] = [];
  for (const n of model.nodes) {
    if (!COMPONENT_TYPES.has(n.type)) continue;
    const staticTokens = n.staticTokens ?? 0;
    const firingKind = FIRING_KIND[n.type];
    // Hooks are not firing-capable via activations; their liveness comes from
    // matcher-vs-situations (Step 3). Here they simply have zero invocations.
    const invocations = firingKind ? (firedCount.get(firingKind)?.get(n.name) ?? 0) : 0;

    const flags: CostFlag[] = [];
    if (firingKind && invocations === 0) flags.push('dead');
    if (invocations > 0 && invocations < underusedBelow) flags.push('underused');
    if (staticTokens >= lowYieldStaticMin && invocations <= 1) flags.push('low-yield');
    // dead-hook: a hook with an assessable tool matcher that matched no situation.
    // Hooks fire deterministically on match, so a never-matched matcher means the
    // hook never had the chance to fire. Wildcard/session-start hooks carry no
    // triggers and are skipped (they fire broadly / every session).
    if (n.type === 'hook' && n.triggers && situations.length > 0 && !situations.some((s) => triggerMatches(n.triggers ?? {}, s))) {
      flags.push('dead-hook');
    }

    rows.push({ nodeId: n.id, name: n.name, kind: n.type, invocations, staticTokens, flags });
  }

  rows.sort((a, b) => {
    const ca = a.staticTokens * a.invocations;
    const cb = b.staticTokens * b.invocations;
    if (ca !== cb) return cb - ca;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });

  return { sufficient: true, stats, rows, mode };
}
