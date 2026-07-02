import type { CostRow, GraphModel, GraphNode } from '@voidcorp/harness-graph';
import { formatCostLines } from '../data/cost.js';
import type { Overlays } from '../scene/overlays.js';

const GITHUB_BASE = 'https://github.com/voidcorp-core/void-harness/blob/main/';

function edgesFor(model: GraphModel, id: string): string[] {
  return model.edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => `${e.from} -[${e.kind}]-> ${e.to}`);
}

/** Render the side panel for a clicked node (description, lines, cost, edges, analysis flags, source link). */
export function renderPanel(
  host: HTMLElement,
  model: GraphModel,
  overlays: Overlays,
  node: GraphNode,
  costIndex: Map<string, CostRow>,
): void {
  const flags: string[] = [];
  if (overlays.conflictNodes.has(node.id)) flags.push('in a conflict / routing cycle');
  if (overlays.orphanNodes.has(node.id)) flags.push('orphan (no relations, never fired)');
  if (overlays.holeNodes.has(node.id)) flags.push('coverage hole');

  const edgeList = edgesFor(model, node.id);
  host.innerHTML = '';
  host.classList.add('open');
  const h = document.createElement('h2');
  h.textContent = node.id;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${node.type} | ${node.lines} lines | pack: ${node.pack ?? 'core'}`;
  const desc = document.createElement('p');
  desc.textContent = node.description || '(no description)';
  host.append(h, meta, desc);

  if (flags.length > 0) {
    const f = document.createElement('p');
    f.className = 'flag';
    f.textContent = `Flags: ${flags.join('; ')}`;
    host.append(f);
  }

  // Cost section — only when this node has a cost row (pack / synthetic nodes have none).
  const costRow = costIndex.get(node.id);
  if (costRow !== undefined) {
    const title = document.createElement('strong');
    title.textContent = 'Cost';
    const ul = document.createElement('ul');
    ul.className = 'cost';
    for (const line of formatCostLines(costRow)) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.append(li);
    }
    host.append(title, ul);
  }

  const edgesTitle = document.createElement('strong');
  edgesTitle.textContent = `Edges (${edgeList.length})`;
  const ul = document.createElement('ul');
  for (const line of edgeList) {
    const li = document.createElement('li');
    li.textContent = line;
    ul.append(li);
  }
  host.append(edgesTitle, ul);

  const link = document.createElement('a');
  link.href = `${GITHUB_BASE}${node.source}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = node.source;
  host.append(link);
}
