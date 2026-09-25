import { describe, expect, it } from 'vitest';
import { checkpointCodec, composeResumeBundle } from './index.js';

describe('session public surface', () => {
  it('exposes checkpoint parsing and ResumeBundle composition together', () => {
    expect(checkpointCodec).toBeTypeOf('function');
    expect(composeResumeBundle).toBeTypeOf('function');
  });
});
