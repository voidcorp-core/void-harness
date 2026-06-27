import { gsap } from 'gsap';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { GraphNode } from '@voidcorp/harness-graph';

interface Positioned {
  x?: number;
  y?: number;
  z?: number;
}

/** Minimal structural surface needed to attach the reticle to the scene. */
export interface ReticleGraph {
  scene(): { add(o: unknown): void };
}

export interface Reticle {
  readonly group: Group;
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A rotating targeting ring added to the scene, hidden until a node is selected. */
export function createReticle(graph: ReticleGraph): Reticle {
  const group = new Group();
  const ring = new Mesh(
    new RingGeometry(14, 16, 48),
    new MeshBasicMaterial({ color: 0x36e0ff, side: DoubleSide, transparent: true, opacity: 0.9 }),
  );
  group.add(ring);
  group.visible = false;
  graph.scene().add(group);
  // Infinite spin is motion; honor prefers-reduced-motion by leaving it static.
  if (!prefersReducedMotion()) {
    gsap.to(group.rotation, { z: Math.PI * 2, duration: 6, repeat: -1, ease: 'none' });
  }
  return { group };
}

/** Snap the reticle onto a node with a quick scale-in (the "lock-on" beat). */
export function moveReticleTo(reticle: Reticle, node: GraphNode & Positioned): void {
  const g = reticle.group;
  g.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
  g.visible = true;
  if (prefersReducedMotion()) {
    g.scale.setScalar(1);
    return;
  }
  gsap.fromTo(
    g.scale,
    { x: 2.4, y: 2.4, z: 2.4 },
    { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2)' },
  );
}
