import { PRODUCT_IDENTITY } from '@voidcorp/hook-runner';
import { describe, expect, it } from 'vitest';
import { globalPluginManifest } from './install.js';

describe('global plugin manifest', () => {
  it('names the repository of the product identity as its homepage', () => {
    expect(globalPluginManifest({ version: '4.0.0' })).toMatchObject({
      version: '4.0.0',
      homepage: PRODUCT_IDENTITY.repositoryUrl,
    });
  });

  it('mirrors the source hook wiring, and adds none the source lacks', () => {
    const hooks = { PreToolUse: [{ matcher: 'Bash', hooks: [] }] };
    expect(globalPluginManifest({ version: '4.0.0', hooks })).toMatchObject({ hooks });
    expect(globalPluginManifest({ version: '4.0.0' })).not.toHaveProperty('hooks');
  });
});
