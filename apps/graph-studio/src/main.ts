import { loadData } from './data/load.js';
import { createGraph } from './render/graph.js';
import { defaultViewState } from './scene/select.js';

const el = document.getElementById('scene');
if (!el) throw new Error('graph-studio: #scene container missing');

const data = loadData();
const handle = createGraph(el, data.model);
handle.setView(defaultViewState());
handle.onNodeClick((node) => {
  // Side panel arrives in Task 8; reflect the click in the title so the path is
  // observable without a console statement (repo norm: no console in committed code).
  document.title = `graph studio // ${node.id}`;
});
