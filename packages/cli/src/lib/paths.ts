// Locate the void-harness `core/claude` source tree.
//
// Strategy:
//  1. If we are running inside the installed npm package, the core lives at
//     `<package_root>/../core/claude` (assuming workspace layout) OR at
//     `<package_root>/core/claude` when published as a single tarball.
//  2. If we are running from the void-harness monorepo (dev mode), use
//     `packages/core/claude` relative to the repo root.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function findCoreSource(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));

  const candidates = [
    // 1. Published npm tarball (assets bundled at <pkg>/core-assets/claude)
    resolve(here, '..', 'core-assets', 'claude'),
    resolve(here, '..', '..', 'core-assets', 'claude'),
    // 2. Monorepo workspace install (sibling @voidcorp/harness-core package)
    resolve(here, '..', '..', '..', 'core', 'claude'),
    // 3. Dev mode (running from packages/cli/dist)
    resolve(here, '..', '..', '..', '..', 'core', 'claude'),
    // 4. Dev mode (running from packages/cli/src via tsx, etc.)
    resolve(here, '..', '..', '..', 'packages', 'core', 'claude'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'skills'))) return candidate;
  }

  throw new Error(
    `findCoreSource: could not locate core/claude tree. Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
  );
}
