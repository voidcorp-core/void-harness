import type { GraphModel } from '@voidcorp/harness-graph';

// Pure core of the live layer. Maps activation events (from the SSE stream or
// /history) onto graph nodes, and computes per-node "lit" intensity at a cursor
// time. The same frameAt() drives both live (cursor = now) and replay (cursor =
// scrubber position) — one calculation, two pilots. No DOM, no Three.js, no clock.

/** Minimal shape the studio needs from an activation event (decoupled from the CLI type). */
export interface StudioActivation {
  readonly ts: string;
  readonly kind: string;
  readonly name: string;
}

/** A node lit at a moment in time (ms epoch), after mapping + timestamp parse. */
export interface Lit {
  readonly nodeId: string;
  readonly ts: number;
}

/** The set of existing node ids — activations resolve against it. */
export type ActivationIndex = ReadonlySet<string>;

// An activation kind resolves to one or more node-id prefixes, tried in order.
// skill covers slash-commands too (both arrive via the Skill tool); tool maps to
// no node (it is a pure situation, reserved for the M8 should-have-fired view).
const KIND_PREFIXES: Record<string, readonly string[]> = {
  skill: ['skill', 'command'],
  agent: ['agent'],
  workflow: ['workflow-def'],
  tool: [],
};

/** Strip an optional `plugin:` prefix, returning the bare component name. */
function bareName(raw: string): string {
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

export function buildActivationIndex(model: GraphModel): ActivationIndex {
  return new Set(model.nodes.map((n) => n.id));
}

/** Resolve an activation to a node id, or undefined if no matching node exists. Tolerant. */
export function nodeIdForActivation(index: ActivationIndex, ev: { kind: string; name: string }): string | undefined {
  const name = bareName(ev.name);
  for (const prefix of KIND_PREFIXES[ev.kind] ?? []) {
    const id = `${prefix}:${name}`;
    if (index.has(id)) return id;
  }
  return undefined;
}

/** Map an activation to a Lit (node id + epoch ms), or undefined if unmapped / bad timestamp. */
export function toLit(index: ActivationIndex, ev: StudioActivation): Lit | undefined {
  const nodeId = nodeIdForActivation(index, ev);
  if (nodeId === undefined) return undefined;
  const ts = Date.parse(ev.ts);
  if (Number.isNaN(ts)) return undefined;
  return { nodeId, ts };
}

/**
 * Per-node intensity (0..1) at `cursorMs`, decaying exponentially with age over
 * `windowMs`. Events outside `[cursor-window, cursor)` (too old or in the future)
 * are excluded; the strongest (most recent) event wins per node. Deterministic.
 */
export function frameAt(events: readonly Lit[], cursorMs: number, windowMs: number): Map<string, number> {
  const out = new Map<string, number>();
  if (windowMs <= 0) return out;
  const halfLife = windowMs / 5; // ~0.03 intensity at the window edge -> reads as off
  for (const { nodeId, ts } of events) {
    const age = cursorMs - ts;
    if (age < 0 || age >= windowMs) continue;
    const intensity = Math.min(1, 2 ** (-age / halfLife));
    if (intensity > (out.get(nodeId) ?? 0)) out.set(nodeId, intensity);
  }
  return out;
}
