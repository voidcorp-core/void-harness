import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION } from './index.js';

describe('harness-graph kernel', () => {
  it('exposes a version constant', () => {
    expect(KERNEL_VERSION).toBe(1);
  });
});
