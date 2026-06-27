import { gsap } from 'gsap';
import type { GraphNode } from '@voidcorp/harness-graph';

// A 3d-force-graph node carries its simulated position once the engine ticks.
interface Positioned { x?: number; y?: number; z?: number }

interface CameraGraph {
  cameraPosition(pos: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, ms: number): void;
}

/** Tween the camera to frame a node (GSAP drives the distance; the graph lib does the move). */
export function focusNode(graph: CameraGraph, node: GraphNode & Positioned): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const z = node.z ?? 0;
  const distance = 120;
  const state = { d: 320 };
  gsap.to(state, {
    d: distance,
    duration: 0.8,
    ease: 'power2.out',
    onUpdate: () => {
      const ratio = 1 + state.d / (Math.hypot(x, y, z) || 1);
      graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 0);
    },
  });
}
