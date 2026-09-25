import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRODUCT_IDENTITY } from '@voidcorp/hook-runner';
import { describe, expect, it } from 'vitest';
import { cliVersion, findCoreSource } from './paths.js';

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string };

describe('cli paths', () => {
  // The version is read only from a package.json bearing the product's name:
  // a name the identity does not hold would read as 0.0.0 and unpin every pack.
  it('reads its own version from the package the identity names', () => {
    expect(manifest.name).toBe(PRODUCT_IDENTITY.packageName);
    expect(cliVersion()).toBe(manifest.version);
    expect(cliVersion()).not.toBe('0.0.0');
  });

  it('finds the core source tree with its skills and plugin manifest', async () => {
    const root = await findCoreSource();
    expect(existsSync(join(root, 'skills'))).toBe(true);
    expect(existsSync(join(root, '.claude-plugin'))).toBe(true);
  });
});
