import model from './generated/model.json' with { type: 'json' };

const el = document.getElementById('scene');
if (el) {
  el.textContent = `harness-graph: ${model.nodes.length} nodes, ${model.edges.length} edges`;
}
