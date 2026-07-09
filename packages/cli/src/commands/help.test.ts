// The help text is the CLI's front door. The audit (issue #69) found it named
// the core plugin `void` (real: `harness`) and listed 2 of 6 packs. These
// invariants keep it honest against the single source of truth in packs.ts.

import { describe, expect, it, vi } from 'vitest';
import { printHelp } from './help.js';
import { CORE_PLUGIN_NAME, PACKS } from '../lib/packs.js';

function capture(): string {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  printHelp();
  spy.mockRestore();
  return out;
}

describe('printHelp', () => {
  it('names the core plugin harness, never the stale `void`', () => {
    const out = capture();
    expect(out).toContain(CORE_PLUGIN_NAME);
    // The core row must not be labelled `void ` (the pre-#69 bug).
    expect(out).not.toMatch(/^\s*void\s+core/m);
  });

  it('lists every real pack from packs.ts', () => {
    const out = capture();
    for (const pack of PACKS) {
      expect(out).toContain(pack.name);
    }
  });

  it('does not tell a consumer to run the unpublished npm package', () => {
    // Distribution is marketplace-only; npx @voidcorp/harness 404s (#69).
    expect(capture()).not.toContain('npx @voidcorp/harness');
  });

  it('points at the marketplace catalog repo', () => {
    expect(capture()).toContain('voidcorp-core/void-plugins');
  });
});
