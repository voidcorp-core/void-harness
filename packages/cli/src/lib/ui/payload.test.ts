import { describe, expect, it, vi } from 'vitest';
import { voidGlobalDir } from './payload.js';

describe('voidGlobalDir', () => {
  it('uses the explicit test and runtime seam before the user home', () => {
    vi.stubEnv('VOID_GLOBAL_DIR', '/contained/void-global');

    expect(voidGlobalDir()).toBe('/contained/void-global');

    vi.unstubAllEnvs();
  });
});
