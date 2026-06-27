import { gsap } from 'gsap';
import type { GraphNode } from '@voidcorp/harness-graph';
import type { Overlays } from '../scene/overlays.js';

/**
 * Minimal surface of the graph instance needed for analysis-layer styling.
 * The full 3d-force-graph type is intentionally not referenced here —
 * this interface is the exact contract this module exercises.
 */
export interface StylableGraph {
  nodeColor(fn: (n: object) => string): unknown;
  nodeOpacity(value: number): unknown;
}

/**
 * Module-level tween ref so successive applyAnalysisStyling calls correctly
 * kill the previous tween instead of creating a fresh object that no tween
 * is tracking (the brief's local-variable approach silently leaked tweens).
 */
let activePulseTween: gsap.core.Tween | undefined;

/**
 * Apply (or clear) the Analysis layer styling: muted orphans, highlighted
 * conflict nodes, dimmed background. Overlap tension edges are added to the
 * link set by the caller (they live in the graph data, not styling).
 *
 * Installed-API adaptations vs. the brief:
 *
 * 1. nodeOpacity(number) is GLOBAL-ONLY (confirmed: three-forcegraph@1.43.4
 *    ThreeForceGraphGeneric.nodeOpacity takes a number, not a per-node fn).
 *    Used here for the scene-wide dim (0.85 active / 0.95 inactive). Per-node
 *    opacity pulsing requires nodeThreeObject, which is a later task.
 *
 * 2. The brief omits onUpdate from the GSAP tween, so pulse.t animates but
 *    nothing drives a re-render. Added onUpdate that re-sets nodeColor each
 *    frame so the conflict-node color actually oscillates on screen.
 *
 * 3. Module-level activePulseTween (undefined-guarded) replaces the brief's
 *    local pulse variable to ensure the active tween is reachable for cleanup
 *    on the next call.
 *
 * 4. nodeColor is NOT restored here when active=false — that responsibility
 *    stays in graph.ts setView (avoids an import cycle; colorForType lives
 *    co-located with the rest of the structural render).
 */
export function applyAnalysisStyling(
  graph: StylableGraph,
  overlays: Overlays,
  active: boolean,
): void {
  activePulseTween?.kill();
  activePulseTween = undefined;

  if (active) {
    const pulse = { t: 0 };
    const colorFn = (raw: object): string => {
      const n = raw as GraphNode;
      if (overlays.conflictNodes.has(n.id)) {
        // Conflict nodes pulse: dark red -> bright red as pulse.t goes 0 -> 1
        const lightness = 40 + Math.round(pulse.t * 30);
        return `hsl(0, 100%, ${lightness}%)`;
      }
      if (overlays.orphanNodes.has(n.id)) return '#3a3a48';
      if (overlays.holeNodes.has(n.id)) return '#fbbf24';
      return '#5a5a6e';
    };
    graph.nodeOpacity(0.85);
    graph.nodeColor(colorFn);
    activePulseTween = gsap.to(pulse, {
      t: 1,
      duration: 1.2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      // Re-set the accessor each frame so 3d-force-graph re-evaluates node
      // colors and the conflict-node pulse is actually visible on screen.
      onUpdate: () => { graph.nodeColor(colorFn); },
    });
  } else {
    graph.nodeOpacity(0.95);
  }
}
