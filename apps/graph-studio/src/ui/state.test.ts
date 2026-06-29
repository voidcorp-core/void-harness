import { describe, expect, it } from 'vitest';
import { defaultViewState } from '../scene/select.js';
import { setSearch, toggleFamily, toggleLayer } from './state.js';

describe('ui state reducers', () => {
  it('toggles a layer without mutating the input', () => {
    const a = defaultViewState();
    const b = toggleLayer(a, 'analysis');
    expect(b.layers.analysis).toBe(true);
    expect(a.layers.analysis).toBe(false); // immutable
  });

  it('toggles a family in and out of the active set', () => {
    const a = defaultViewState();
    const without = toggleFamily(a, 'overlay');
    expect(without.families.has('overlay')).toBe(false);
    expect(toggleFamily(without, 'overlay').families.has('overlay')).toBe(true);
  });

  it('sets the search query', () => {
    expect(setSearch(defaultViewState(), 'tdd').search).toBe('tdd');
  });
});
