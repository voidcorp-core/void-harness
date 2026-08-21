import { describe, expect, it } from 'vitest';
import { createSpecialistDispatch } from './index.js';

describe('mission-engine public surface', () => {
  it('exports the runtime-neutral specialist dispatcher', () => {
    expect(createSpecialistDispatch).toBeTypeOf('function');
  });
});
