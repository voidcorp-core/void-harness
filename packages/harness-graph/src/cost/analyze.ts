import type { GraphModel, NodeType } from '../model/types.js';
import type { ActivationEvent, ActivationKind, ActivationTrigger } from '../behavior/types.js';
import { FIRING_KIND, bareName, triggerMatches, within } from '../behavior/index.js';
import { analyzeOutcomes, outcomeKey } from '../outcome/analyze.js';
import { DEFAULT_PRICING, deriveDollars } from './pricing.js';
import type { CostFlag, CostOptions, CostReport, CostRow, CostStats, RealSignal, SessionCost, SessionTokens } from './types.js';

export * from './types.js';

const DEFAULT_MIN_SESSIONS = 3;
const DEFAULT_MIN_EVENTS = 20;
const DEFAULT_UNDERUSED_BELOW = 2;
const DEFAULT_LOW_YIELD_STATIC_MIN = 1500;
const EXPENSIVE_DECILE = 0.1;

/** Node types that represent a harness component earning (or not) its place.
 * `pack` is a grouping, not a firing component, so it is excluded from cost rows. */
const COMPONENT_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'skill',
  'command',
  'agent',
  'workflow-def',
  'hook',
]);

function median(nums: readonly number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/** Per-metric median tokens across the given session costs (each metric medianed independently). */
function medianTokens(costs: readonly SessionCost[]): SessionTokens {
  return {
    in: median(costs.map((c) => c.tokens.in)),
    out: median(costs.map((c) => c.tokens.out)),
    cacheRead: median(costs.map((c) => c.tokens.cacheRead)),
    cacheCreation: median(costs.map((c) => c.tokens.cacheCreation)),
  };
}

/** cacheRead as a fraction of all input-side tokens; 0 when there are none. */
function cacheReadRatio(t: SessionTokens): number {
  const inputSide = t.in + t.cacheRead + t.cacheCreation;
  return inputSide === 0 ? 0 : t.cacheRead / inputSide;
}

/** Total real tokens — the ranking key for the `expensive` decile. */
function totalTokens(t: SessionTokens): number {
  return t.in + t.out + t.cacheRead + t.cacheCreation;
}

/**
 * Attribute token cost per harness component and flag the ones that do not earn
 * their place. Pure: no I/O, deterministic.
 *
 * Static cost = staticTokens x invocations (tokens the component actually
 * injected). When `opts.sessionCosts` is given (phase 2), each row also gets a
 * correlational real signal: the per-metric median across the sessions where the
 * component fired (intersected with the sessions that have a cost record).
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
  const pricing = opts.pricing ?? DEFAULT_PRICING;

  const scoped = activations.filter((e) => within(e, opts.sinceMs));
  const sessions = new Set(scoped.map((e) => e.sessionId));
  const stats: CostStats = { events: scoped.length, sessions: sessions.size };

  const costById = new Map<string, SessionCost>((opts.sessionCosts ?? []).map((c) => [c.sessionId, c]));
  const mode: CostReport['mode'] = costById.size > 0 ? 'full' : 'static-only';

  // Value side (issue #71): completions per component, joined by kind + bare name.
  const outcomeByKey = analyzeOutcomes(opts.outcomes ?? []);

  if (stats.sessions < minSessions || stats.events < minEvents) {
    return { sufficient: false, stats, rows: [], mode };
  }

  // invocations[kind][bareName] and the sessions each fired in; tool situations per session.
  const firedCount = new Map<ActivationKind, Map<string, number>>();
  const firedSessions = new Map<string, Set<string>>(); // `${kind}\t${name}` -> sessionIds
  const situationsBySession = new Map<string, ActivationTrigger[]>();
  const situations: ActivationTrigger[] = [];
  for (const e of scoped) {
    const name = bareName(e.name);
    let byName = firedCount.get(e.kind);
    if (!byName) {
      byName = new Map();
      firedCount.set(e.kind, byName);
    }
    byName.set(name, (byName.get(name) ?? 0) + 1);
    const key = `${e.kind}\t${name}`;
    let set = firedSessions.get(key);
    if (!set) {
      set = new Set();
      firedSessions.set(key, set);
    }
    set.add(e.sessionId);
    if (e.kind === 'tool') {
      situations.push(e.trigger);
      const list = situationsBySession.get(e.sessionId) ?? [];
      list.push(e.trigger);
      situationsBySession.set(e.sessionId, list);
    }
  }

  // Sessions where a component was active: firing nodes by their activations,
  // hooks by the sessions whose situations matched their tool matcher.
  const activeSessions = (n: GraphModel['nodes'][number], firingKind: ActivationKind | undefined): Set<string> => {
    if (firingKind) return firedSessions.get(`${firingKind}\t${n.name}`) ?? new Set();
    if (n.type === 'hook' && n.triggers) {
      const out = new Set<string>();
      for (const [sessionId, sits] of situationsBySession) {
        if (sits.some((s) => triggerMatches(n.triggers ?? {}, s))) out.add(sessionId);
      }
      return out;
    }
    return new Set();
  };

  const realSignalFor = (sessionIds: Set<string>): RealSignal | undefined => {
    const costs: SessionCost[] = [];
    for (const id of sessionIds) {
      const c = costById.get(id);
      if (c) costs.push(c);
    }
    if (costs.length === 0) return undefined;
    const tokens = medianTokens(costs);
    const perSessionDollars = costs
      .map((c) => deriveDollars(c.tokens, c.model, pricing))
      .filter((d): d is number => d !== undefined);
    const dollars = perSessionDollars.length > 0 ? median(perSessionDollars) : undefined;
    return dollars === undefined ? { tokens } : { tokens, dollars };
  };

  const rows: CostRow[] = [];
  for (const n of model.nodes) {
    if (!COMPONENT_TYPES.has(n.type)) continue;
    const staticTokens = n.staticTokens ?? 0;
    const firingKind = FIRING_KIND[n.type];
    // Hooks are not firing-capable via activations; their liveness comes from
    // matcher-vs-situations (Step 3). Here they simply have zero invocations.
    const invocations = firingKind ? (firedCount.get(firingKind)?.get(n.name) ?? 0) : 0;

    const flags: CostFlag[] = [];
    // Doctrine skills are followed passively (via PHILOSOPHY + enforcing hooks), not
    // invoked through the Skill tool, so their liveness is structural — same reasoning
    // as hooks above. Zero invocations is expected; exempt them from the under-use flags
    // and mark them positively instead. `expensive` (real-cost decile) still applies below.
    const alwaysLoaded = n.activation === 'always';
    if (alwaysLoaded) {
      flags.push('always');
    } else {
      if (firingKind && invocations === 0) flags.push('dead');
      if (invocations > 0 && invocations < underusedBelow) flags.push('underused');
      if (staticTokens >= lowYieldStaticMin && invocations <= 1) flags.push('low-yield');
    }
    // dead-hook: a hook with an assessable tool matcher that matched no situation.
    // Hooks fire deterministically on match, so a never-matched matcher means the
    // hook never had the chance to fire. Wildcard/session-start hooks carry no
    // triggers and are skipped (they fire broadly / every session).
    if (n.type === 'hook' && n.triggers && situations.length > 0 && !situations.some((s) => triggerMatches(n.triggers ?? {}, s))) {
      flags.push('dead-hook');
    }

    const outcome = firingKind ? outcomeByKey.get(outcomeKey(firingKind, n.name)) : undefined;
    const row: CostRow = {
      nodeId: n.id,
      name: n.name,
      kind: n.type,
      invocations,
      staticTokens,
      flags,
      ...(outcome ? { outcome } : {}),
    };
    if (mode === 'full') {
      const realSignal = realSignalFor(activeSessions(n, firingKind));
      if (realSignal) {
        rows.push({ ...row, realSignal, cacheReadRatio: cacheReadRatio(realSignal.tokens) });
        continue;
      }
    }
    rows.push(row);
  }

  // expensive: real signal in the top decile of total real tokens (full mode only).
  const ranked = rows
    .flatMap((r) => (r.realSignal ? [{ r, total: totalTokens(r.realSignal.tokens) }] : []))
    .sort((a, b) => b.total - a.total);
  if (ranked.length > 0) {
    const topN = Math.ceil(ranked.length * EXPENSIVE_DECILE);
    for (const { r } of ranked.slice(0, topN)) (r.flags as CostFlag[]).push('expensive');
  }

  rows.sort((a, b) => {
    const ta = a.realSignal ? totalTokens(a.realSignal.tokens) : undefined;
    const tb = b.realSignal ? totalTokens(b.realSignal.tokens) : undefined;
    // Rows with a real signal rank above static-only rows in full mode.
    if ((ta === undefined) !== (tb === undefined)) return ta === undefined ? 1 : -1;
    const ca = ta ?? a.staticTokens * a.invocations;
    const cb = tb ?? b.staticTokens * b.invocations;
    if (ca !== cb) return cb - ca;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });

  return { sufficient: true, stats, rows, mode };
}
