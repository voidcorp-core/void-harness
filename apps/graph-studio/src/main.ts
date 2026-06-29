import { loadData } from './data/load.js';
import { createGraph } from './render/graph.js';
import { playFlow } from './render/flow.js';
import { type IntroGraph, playIntro } from './render/intro.js';
import { createReticle, moveReticleTo, type ReticleGraph } from './render/reticle.js';
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
const handle = createGraph(scene, data.model, overlays, data.usage);
handle.setView(state);

// Lock-on reticle: snaps onto the selected node, frames the camera, opens the HUD.
const reticle = createReticle(handle.graph as unknown as ReticleGraph);
handle.onNodeClick((node) => {
  // The focus render (graph.ts) pins the clicked node at the origin and owns the
  // camera framing, so the reticle lands on the origin (the hero) and we do NOT
  // call focusNode here -- doing so forced the camera to a degenerate (0,0,0).
  moveReticleTo(reticle, node);
  // Workflows layer on: a workflow-def opens its phase sub-view; off: it reads as a
  // normal node (standard dossier panel). Other node types always use the panel.
  if (node.type === 'workflow-def' && state.layers.workflows) {
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

// One-time boot intro (camera sweep + "SYSTEM ONLINE" overlay); skipped under reduced-motion.
playIntro(handle.graph as unknown as IntroGraph);
