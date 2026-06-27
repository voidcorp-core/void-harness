import type { NodeType } from '@voidcorp/harness-graph';

// Neon-holographic hues (bloom-lit in Task 12). Aligned with the HUD palette tokens.
export const TYPE_COLORS: Record<NodeType, string> = {
  skill: '#5eead4', // holo-teal
  agent: '#a78bfa', // holo-violet
  hook: '#ffb547', // holo-amber
  command: '#36e0ff', // holo-cyan
  pack: '#f472b6', // holo-magenta
  'workflow-def': '#9ae600', // holo-lime
};

/** Node radius from line count: sqrt scale, floored so tiny nodes stay visible. */
export function sizeForLines(lines: number): number {
  return 2 + Math.sqrt(Math.max(0, lines)) * 0.9;
}

export function colorForType(type: NodeType): string {
  return TYPE_COLORS[type];
}

/** Halo intensity 0..1 from invocation count: log-shaped, 0 means never fired. */
export function haloForCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / 3);
}

/** Deterministic per-cluster anchor on a ring (golden-angle), used by the cluster force. */
export function clusterAnchor(index: number, total: number): { x: number; y: number; z: number } {
  const radius = 120 + total * 8;
  const golden = 2.399963229728653; // 137.5 degrees in radians
  const angle = index * golden;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * 0.5) * radius * 0.4,
    z: Math.sin(angle) * radius,
  };
}
