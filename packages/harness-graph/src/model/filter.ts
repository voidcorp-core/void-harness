import type { GraphModel, GraphNode } from './types.js';

/**
 * Restrict a model to core plus the enabled packs. Used on the consumer path so a pack
 * the consumer did not enable does not surface as a false "dead" component.
 *
 * A `pack` node carries `pack: null` (it is not scoped to itself), so it is kept by its
 * `name`; every other node is kept when it is core (no pack) or its pack is enabled.
 *
 * `enabled === undefined` means "no enabled-packs signal" (settings absent) and returns the
 * model untouched — the caller falls back to the full model rather than hiding everything.
 */
export function filterByEnabledPacks(
  model: GraphModel,
  enabled: readonly string[] | undefined,
): GraphModel {
  if (enabled === undefined) return model;

  const active = new Set(enabled);
  const keep = (node: GraphNode): boolean =>
    node.type === 'pack' ? active.has(node.name) : node.pack === null || active.has(node.pack); // allow-null: model boundary, pack is `string | null`

  const nodes = model.nodes.filter(keep);
  const surviving = new Set(nodes.map((n) => n.id));
  const edges = model.edges.filter((e) => surviving.has(e.from) && surviving.has(e.to));

  return { version: model.version, nodes, edges };
}
