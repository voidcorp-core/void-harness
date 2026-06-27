import { loadData } from './data/load.js';
import { createGraph } from './render/graph.js';
import { buildOverlays } from './scene/overlays.js';
import { defaultViewState } from './scene/select.js';
import { renderControls } from './ui/controls.js';
import { renderPanel } from './ui/panel.js';

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
const handle = createGraph(scene, data.model);
handle.setView(state);
handle.onNodeClick((node) => renderPanel(panel, data.model, overlays, node));

renderControls(controls, {
  state,
  onChange: (next) => {
    state = next;
    handle.setView(next);
  },
  onPlayFlow: () => {
    // Implemented in Task 10.
  },
});
