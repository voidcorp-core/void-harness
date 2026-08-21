import { describe, expect, it } from 'vitest';
import { analyzeSynergy, parseSpecialistLifecycle } from './index.js';

describe('harness-graph public surface', () => {
  it('exports the cross-component synergy analyzer', () => {
    expect(analyzeSynergy).toBeTypeOf('function');
    expect(parseSpecialistLifecycle).toBeTypeOf('function');
  });
});
