import { FAMILIES, FAMILY_LABELS } from '../scene/families.js';
import type { LayerName, ViewState } from '../scene/select.js';
import { setSearch, toggleFamily, toggleLayer } from './state.js';

const LAYERS: readonly { key: LayerName; label: string }[] = [
  { key: 'structure', label: 'Structure' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'flow', label: 'Flow' },
  { key: 'workflows', label: 'Workflows' },
];

export interface ControlsOptions {
  state: ViewState;
  onChange(next: ViewState): void;
  onPlayFlow(): void;
}

/** Render layer toggles, family filters, a search box, and the play-flow button. */
export function renderControls(host: HTMLElement, opts: ControlsOptions): void {
  let state = opts.state;
  const rerender = (next: ViewState): void => {
    state = next;
    opts.onChange(next);
    draw();
  };

  function draw(): void {
    host.innerHTML = '';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'search id / description';
    search.value = state.search;
    search.addEventListener('input', () => rerender(setSearch(state, search.value)));
    host.append(search);

    const layers = document.createElement('div');
    layers.className = 'group';
    for (const l of LAYERS) {
      layers.append(checkbox(l.label, state.layers[l.key], () => rerender(toggleLayer(state, l.key))));
    }
    host.append(layers);

    const fams = document.createElement('div');
    fams.className = 'group';
    for (const f of FAMILIES) {
      fams.append(checkbox(FAMILY_LABELS[f], state.families.has(f), () => rerender(toggleFamily(state, f))));
    }
    host.append(fams);

    const play = document.createElement('button');
    play.textContent = 'Play flow';
    play.addEventListener('click', () => opts.onPlayFlow());
    host.append(play);
  }

  draw();
}

function checkbox(label: string, checked: boolean, onToggle: () => void): HTMLLabelElement {
  const wrap = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', onToggle);
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(input, span);
  return wrap;
}
