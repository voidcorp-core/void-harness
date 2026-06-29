import type { WorkflowView } from '../scene/workflow-view.js';

/** Render the workflow sub-view: a sequential phase schematic + neighbor list. Run replay is P2. */
export function renderWorkflowView(host: HTMLElement, view: WorkflowView): void {
  host.innerHTML = '';
  host.classList.add('open');
  const h = document.createElement('h2');
  h.textContent = `workflow: ${view.id}`;
  host.append(h);

  if (view.phases.length > 0) {
    const phasesTitle = document.createElement('strong');
    phasesTitle.textContent = 'Phases';
    const ol = document.createElement('ol');
    for (const p of view.phases) {
      const li = document.createElement('li');
      li.textContent = p.detail ? `${p.title} - ${p.detail}` : p.title;
      ol.append(li);
    }
    host.append(phasesTitle, ol);
  } else {
    const none = document.createElement('p');
    none.className = 'meta';
    none.textContent = 'No phases declared in meta.';
    host.append(none);
  }

  const replay = document.createElement('p');
  replay.className = 'meta';
  replay.textContent = 'Run replay: available in Phase 2 (needs activation events).';
  host.append(replay);

  const neighborsTitle = document.createElement('strong');
  neighborsTitle.textContent = `Neighbors (${view.neighbors.length})`;
  const ul = document.createElement('ul');
  for (const n of view.neighbors) {
    const li = document.createElement('li');
    li.textContent = `${n.kind}: ${n.id}`;
    ul.append(li);
  }
  host.append(neighborsTitle, ul);
}
