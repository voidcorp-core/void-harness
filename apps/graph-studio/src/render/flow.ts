import { gsap } from 'gsap';
import type { ForceGraph3DInstance, LinkObject } from '3d-force-graph';
import type { EdgeKind, GraphModel } from '@voidcorp/harness-graph';
import { familyOf } from '../scene/families.js';
import { flowChain } from '../scene/flow.js';

// Links at runtime carry `kind` because setView in graph.ts spreads GraphEdge into them.
// Intersection type at the lib boundary; the static LinkObject type omits `kind`.
type KindedLink = LinkObject & { readonly kind: EdgeKind };

function endpointId(end: string | number | object | undefined): string | undefined {
  if (end === undefined) return undefined;
  if (typeof end === 'string') return end;
  if (typeof end === 'number') return String(end);
  // After the force engine runs, source/target are resolved to node objects.
  const id = (end as { id?: string | number }).id;
  return id !== undefined ? String(id) : undefined;
}

/** Animate a routing impulse: emit particle bursts wavefront-by-wavefront from startId. */
export function playFlow(graph: ForceGraph3DInstance, model: GraphModel, startId: string): void {
  const levels = flowChain(model, startId);
  const { links } = graph.graphData();
  // Localized cast: links have `kind` at runtime from the GraphEdge spread in setView.
  const kindedLinks = (links as unknown as KindedLink[]).filter(
    (l) => familyOf(l.kind) === 'routing',
  );

  const timeline = gsap.timeline();
  for (let i = 0; i < levels.length - 1; i += 1) {
    const fromSet = new Set(levels[i] ?? []);
    const toSet = new Set(levels[i + 1] ?? []);
    const wave = kindedLinks.filter((l) => {
      const src = endpointId(l.source);
      const tgt = endpointId(l.target);
      return src !== undefined && tgt !== undefined && fromSet.has(src) && toSet.has(tgt);
    });
    timeline.call(
      () => {
        for (const l of wave) graph.emitParticle(l);
      },
      [],
      i * 0.45,
    );
  }
}
