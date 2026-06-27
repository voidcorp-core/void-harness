import { gsap } from 'gsap';
import type { MeshBasicMaterial, Object3D } from 'three';

/**
 * Minimal surface of the graph instance needed to swap node objects for the
 * Analysis layer. Task 12 replaced flat `.nodeColor`/`.nodeOpacity` styling with
 * custom `.nodeThreeObject` objects, so analysis dimming/highlighting now works
 * by rebuilding those objects (a dim builder) instead of recoloring a default
 * sphere — `.nodeColor` no longer drives a custom object.
 */
export interface AnalysisGraph {
  nodeThreeObject(fn: (n: object) => Object3D): unknown;
  refresh(): unknown;
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Module-level tween ref so successive calls kill the previous pulse instead of
 * leaking a detached tween (carried over from the Task 9 fix).
 */
let activePulseTween: gsap.core.Tween | undefined;

/**
 * Apply (or clear) the Analysis layer styling by swapping the node-object
 * builder and rebuilding. When active, every node is rebuilt by `dimBuild`
 * (conflict = bright red, hole = amber, orphan = muted, else dimmed); when
 * inactive, `normalBuild` restores the glowing structural nodes.
 *
 * The conflict pulse is FULL: `dimBuild` collects the conflict nodes' unlit
 * `MeshBasicMaterial`s via the `collect` callback, and a GSAP tween animates
 * their colour each frame. Mutating a material's colour re-renders on the next
 * frame without a `refresh()`, so the pulse is smooth and bloom-lit. Under
 * `prefers-reduced-motion` the conflict nodes stay statically bright (no strobe).
 */
export function applyAnalysisStyling(
  graph: AnalysisGraph,
  active: boolean,
  normalBuild: (raw: object) => Object3D,
  dimBuild: (raw: object, collect: (m: MeshBasicMaterial) => void) => Object3D,
): void {
  activePulseTween?.kill();
  activePulseTween = undefined;

  if (!active) {
    graph.nodeThreeObject(normalBuild);
    graph.refresh();
    return;
  }

  const conflictMats: MeshBasicMaterial[] = [];
  graph.nodeThreeObject((raw) =>
    dimBuild(raw, (m) => {
      conflictMats.push(m);
    }),
  );
  graph.refresh();

  if (prefersReducedMotion()) return;

  const pulse = { t: 0 };
  activePulseTween = gsap.to(pulse, {
    t: 1,
    duration: 1.2,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    onUpdate: () => {
      const r = 0.45 + pulse.t * 0.55;
      for (const m of conflictMats) m.color.setRGB(r, 0.08, 0.08);
    },
  });
}
