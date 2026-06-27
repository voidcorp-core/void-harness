import type { Family } from '../scene/families.js';
import type { LayerName, ViewState } from '../scene/select.js';

export function toggleLayer(state: ViewState, layer: LayerName): ViewState {
  return { ...state, layers: { ...state.layers, [layer]: !state.layers[layer] } };
}

export function toggleFamily(state: ViewState, family: Family): ViewState {
  const families = new Set(state.families);
  if (families.has(family)) families.delete(family);
  else families.add(family);
  return { ...state, families };
}

export function setSearch(state: ViewState, query: string): ViewState {
  return { ...state, search: query };
}
