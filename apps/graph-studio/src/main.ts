import { loadData } from './data/load.js';
import { createGraph } from './render/graph.js';
import { playFlow } from './render/flow.js';
import { buildOverlays } from './scene/overlays.js';
import { defaultViewState } from './scene/select.js';
import { workflowView } from './scene/workflow-view.js';
import { renderControls } from './ui/controls.js';
import { renderPanel } from './ui/panel.js';
import { renderWorkflowView } from './ui/workflow.js';

const scene = document.getElementById('scene');
if (!scene) throw new Error('graph-studio: #scene container missing');

const data = loadData();
const overlays = buildOverlays(data.findings, data.model.edges);

const panel = document.createElement('div');
panel.className = 'panel';
const controls = document.createElement('div');
controls.className = 'controls';
document.body.append(panel, controls);

let state = defaultViewState();
const handle = createGraph(scene, data.model, overlays);
handle.setView(state);
handle.onNodeClick((node) => {
  if (node.type === 'workflow-def') {
    const meta = data.workflows[node.id] ?? { phases: [] };
    renderWorkflowView(panel, workflowView(data.model, node, meta));
  } else {
    renderPanel(panel, data.model, overlays, node);
  }
});

renderControls(controls, {
  state,
  onChange: (next) => {
    state = next;
    handle.setView(next);
  },
  onPlayFlow: () => {
    const start = data.model.nodes.find((n) => n.id === 'skill:brainstorming') ?? data.model.nodes[0];
    if (start !== undefined) playFlow(handle.graph, data.model, start.id);
  },
});
