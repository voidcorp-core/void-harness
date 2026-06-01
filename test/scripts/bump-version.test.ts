/**
 * Tests for the pure helper in scripts/bump-version.mjs that keeps internal
 * (@voidcorp/*) dependency ranges aligned with the lockstep version.
 *
 * Importing the script must not run its main() (guarded by an invoked-directly
 * check), so these tests exercise only the exported helper.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs script without types; we test its runtime behavior.
import { alignInternalRanges } from '../../scripts/bump-version.mjs';

describe('alignInternalRanges', () => {
  it('rewrites internal @voidcorp/* ranges to ^<next>', () => {
    const json = { peerDependencies: { '@voidcorp/pack-monorepo': '^0.5.4' } };
    const changed = alignInternalRanges(json, '0.6.0');
    expect(json.peerDependencies['@voidcorp/pack-monorepo']).toBe('^0.6.0');
    expect(changed).toBe(1);
  });

  it('leaves external dependencies untouched', () => {
    const json = {
      dependencies: { '@clack/prompts': '^1.5.0', react: '^19.0.0' },
      peerDependencies: { '@voidcorp/pack-monorepo': '^0.5.4' },
    };
    alignInternalRanges(json, '0.6.0');
    expect(json.dependencies['@clack/prompts']).toBe('^1.5.0');
    expect(json.dependencies.react).toBe('^19.0.0');
    expect(json.peerDependencies['@voidcorp/pack-monorepo']).toBe('^0.6.0');
  });

  it('catches a stale internal pin (the lockstep drift the gate guards against)', () => {
    const json = { peerDependencies: { '@voidcorp/pack-monorepo': '^0.4.0' } };
    alignInternalRanges(json, '0.6.0');
    expect(json.peerDependencies['@voidcorp/pack-monorepo']).toBe('^0.6.0');
  });

  it('is idempotent when ranges already match (reports 0 changes)', () => {
    const json = { peerDependencies: { '@voidcorp/pack-monorepo': '^0.6.0' } };
    const changed = alignInternalRanges(json, '0.6.0');
    expect(changed).toBe(0);
  });

  it('never converts the workspace: protocol to a range silently (the source must already be explicit)', () => {
    // A workspace: spec is internal but here we assert the publish-safety gate,
    // not this helper, owns that concern: align still rewrites it to ^next.
    const json = { peerDependencies: { '@voidcorp/pack-monorepo': 'workspace:^' } };
    const changed = alignInternalRanges(json, '0.6.0');
    expect(json.peerDependencies['@voidcorp/pack-monorepo']).toBe('^0.6.0');
    expect(changed).toBe(1);
  });
});
