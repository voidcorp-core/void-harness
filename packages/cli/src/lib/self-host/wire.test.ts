import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { wireSelfHostRuntimeSurfaces } from './wire.js';

const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'core');

function scratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Self-host compiles into an artifact that is not where the harness will live,
// so this module is the one place where the two roots are guaranteed to differ:
// bytes go to the artifact, absolute references name the final root. Swapping
// them produces a manifest that points at a staging directory deleted minutes
// later, and nothing downstream would notice until a hook failed to launch.
describe('wireSelfHostRuntimeSurfaces', () => {
  it('writes into the artifact and points its absolute references at the final root', async () => {
    const artifactRoot = scratch('void-selfhost-artifact-');
    const finalRoot = scratch('void-selfhost-final-');

    await wireSelfHostRuntimeSurfaces({
      artifactRoot,
      overlayRoot: CORE_ROOT,
      finalRoot,
      sourceHash: 'deadbeef',
      mode: 'shadow',
    });

    const manifest = readFileSync(join(artifactRoot, '.codex', 'hooks.json'), 'utf8');
    expect(manifest).toContain(join(finalRoot, '.void', 'hooks'));
    expect(manifest).not.toContain(artifactRoot);
  });
});
