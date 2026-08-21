import type { GraphModel, GraphNode, NodeType } from '../model/types.js';
import { triggerMatches } from './match.js';
import type { ActivationEvent, ActivationKind, BehaviorFinding } from './types.js';

export * from './types.js';
export { parseActivations } from './parse.js';
export { globMatches, triggerMatches } from './match.js';

export interface BehaviorOptions {
  /** Absolute cutoff (epoch ms); events older than this are excluded. The shell injects it. */
  readonly sinceMs?: number;
  readonly minSessions?: number;
  readonly minEvents?: number;
}

export interface BehaviorStats {
  readonly events: number;
  readonly sessions: number;
  readonly excludedEvents: number;
  readonly excludedSessions: number;
}

export interface BehaviorReport {
  readonly sufficient: boolean;
  readonly stats: BehaviorStats;
  readonly findings: BehaviorFinding[];
}

const DEFAULT_MIN_SESSIONS = 3;
const DEFAULT_MIN_EVENTS = 20;

// Firing-capable node types and the activation kind that records their firing.
// command fires through the Skill tool, so it shares the 'skill' activation kind.
// Shared with the cost kernel so "what counts as firing" lives in one place.
export const FIRING_KIND: Partial<Record<NodeType, ActivationKind>> = {
  skill: 'skill',
  command: 'skill',
  agent: 'agent',
  'workflow-def': 'workflow',
};

/** Strip a plugin/namespace prefix (`harness:void-tdd` -> `void-tdd`) to match node names. */
export function bareName(raw: string): string {
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

/** Whether an activation falls inside the `sinceMs` window. Shared with the cost
 * kernel so the NaN guard + cutoff semantics live in one place. */
export function within(ev: ActivationEvent, sinceMs: number | undefined): boolean {
  if (sinceMs === undefined) return true;
  const t = Date.parse(ev.ts);
  return !Number.isNaN(t) && t >= sinceMs;
}

/** Internal self-host and hook-smoke missions prove the harness can exercise itself,
 * not that a human workflow selected a component. Keep them out of adoption evidence. */
export function isSyntheticBehaviorSession(sessionId: string): boolean {
  return sessionId.startsWith('mis_selfhost_') || sessionId.startsWith('mis_smoke');
}

export function analyzeBehavior(model: GraphModel, events: readonly ActivationEvent[], opts: BehaviorOptions = {}): BehaviorReport {
  const minSessions = opts.minSessions ?? DEFAULT_MIN_SESSIONS;
  const minEvents = opts.minEvents ?? DEFAULT_MIN_EVENTS;
  const withinWindow = events.filter((e) => within(e, opts.sinceMs));
  const excluded = withinWindow.filter((event) => isSyntheticBehaviorSession(event.sessionId));
  const scoped = withinWindow.filter((event) => !isSyntheticBehaviorSession(event.sessionId));
  const sessions = new Set(scoped.map((e) => e.sessionId));
  const stats: BehaviorStats = {
    events: scoped.length,
    sessions: sessions.size,
    excludedEvents: excluded.length,
    excludedSessions: new Set(excluded.map((event) => event.sessionId)).size,
  };

  if (stats.sessions < minSessions || stats.events < minEvents) {
    return { sufficient: false, stats, findings: [] };
  }

  // Fired set per activation kind: kind -> set of bare names that fired anywhere.
  const firedByKind = new Map<ActivationKind, Set<string>>();
  // Per-session fired skills + the tool-use situations observed.
  const firedSkillsBySession = new Map<string, Set<string>>();
  const situationsBySession = new Map<string, ActivationEvent['trigger'][]>();
  for (const e of scoped) {
    const name = bareName(e.name);
    let set = firedByKind.get(e.kind);
    if (!set) {
      set = new Set();
      firedByKind.set(e.kind, set);
    }
    set.add(name);
    if (e.kind === 'skill') {
      let s = firedSkillsBySession.get(e.sessionId);
      if (!s) {
        s = new Set();
        firedSkillsBySession.set(e.sessionId, s);
      }
      s.add(name);
    } else if (e.kind === 'tool') {
      const list = situationsBySession.get(e.sessionId) ?? [];
      list.push(e.trigger);
      situationsBySession.set(e.sessionId, list);
    }
  }

  const findings: BehaviorFinding[] = [];

  // telemetry-gap: a whole firing kind with >= 2 firing-capable nodes but zero recorded
  // activations is far more likely a recorder/join-key break (the meter does not record
  // that tool, e.g. the spawn tool named Agent vs Task) than every component of that kind
  // being independently dead. Collapse those dead-nodes into one gap. always-loaded nodes
  // are excluded from the count -- they are exempt from dead regardless, so they are no
  // evidence of a recorder break. A single-node kind stays a dead-node: with one member,
  // "kind unrecorded" is indistinguishable from a genuinely dead component.
  const GAP_MIN_NODES = 2;
  const firingNodesByKind = new Map<ActivationKind, GraphNode[]>();
  for (const n of model.nodes) {
    const kind = FIRING_KIND[n.type];
    if (kind === undefined || n.activation === 'always') continue;
    const list = firingNodesByKind.get(kind) ?? [];
    list.push(n);
    firingNodesByKind.set(kind, list);
  }
  const gappedKinds = new Set<ActivationKind>();
  for (const [kind, nodes] of firingNodesByKind) {
    const fired = firedByKind.get(kind);
    const matchingActivation = nodes.some((node) => fired?.has(node.name) === true);
    if (nodes.length >= GAP_MIN_NODES && !matchingActivation) {
      const ids = nodes.map((node) => node.id);
      gappedKinds.add(kind);
      findings.push({
        kind: 'telemetry-gap',
        severity: 'info',
        nodes: [...ids].sort(),
        evidence: `${ids.length} '${kind}' nodes but 0 '${kind}' activations recorded in ${stats.events} events across ${stats.sessions} sessions -- likely the activation-meter does not record this tool, not ${ids.length} dead components`,
        suggestion: `verify the activation-meter maps the tool to kind '${kind}' before treating these as dead (HITL).`,
      });
    }
  }

  // dead-node: a firing-capable node whose bare name never appears under its kind.
  for (const n of model.nodes) {
    const kind = FIRING_KIND[n.type];
    if (kind === undefined) continue;
    // Doctrine skills (activation: always) are followed passively, never invoked via the
    // Skill tool — their liveness is structural, so zero firings is not a death signal.
    if (n.activation === 'always') continue;
    // A gapped kind is unrecorded, not dead: its nodes are reported once as a telemetry-gap.
    if (gappedKinds.has(kind)) continue;
    if (firedByKind.get(kind)?.has(n.name)) continue;
    findings.push({
      kind: 'dead-node',
      severity: 'info',
      nodes: [n.id],
      evidence: `never fired in ${stats.events} events across ${stats.sessions} sessions`,
      suggestion: 'confirm it is reachable and needed, or consider deprecating (HITL).',
    });
  }

  // should-have-fired: a triggered skill whose trigger matched a session situation it did not fire on.
  for (const n of model.nodes) {
    if (n.type !== 'skill' || n.triggers === undefined) continue;
    let count = 0;
    for (const [sessionId, situations] of situationsBySession) {
      const matched = situations.some((s) => triggerMatches(n.triggers ?? {}, s));
      if (matched && !firedSkillsBySession.get(sessionId)?.has(n.name)) count += 1;
    }
    if (count > 0) {
      findings.push({
        kind: 'should-have-fired',
        severity: 'info',
        nodes: [n.id],
        evidence: `trigger matched a situation but the skill did not fire in ${count} session(s)`,
        suggestion: 'consider whether it should auto-fire here, or refine its declared triggers.',
        count,
      });
    }
  }

  findings.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.nodes.join() < b.nodes.join() ? -1 : 1));
  return { sufficient: true, stats, findings };
}
