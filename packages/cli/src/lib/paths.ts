// Locate the void-harness `packages/core` source tree (after the marketplace
// restructure of 2026-05-30). Used by the CLI for read-only operations like
// listing available skills/hooks; the actual plugin installation is now done
// by Claude Code via the marketplace mechanism (see init.ts).
//
// Strategy:
//  1. Published npm tarball — assets bundled at <pkg>/core-assets/
//  2. Monorepo workspace install — sibling `core` package
//  3. Dev mode — running from packages/cli/{dist,src}

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function findCoreSource(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));

  const candidates = [
    // 1. Published npm tarball
    resolve(here, '..', 'core-assets'),
    resolve(here, '..', '..', 'core-assets'),
    // 2. Monorepo workspace install (sibling `core` package)
    resolve(here, '..', '..', '..', 'core'),
    // 3. Dev mode (running from packages/cli/dist)
    resolve(here, '..', '..', '..', '..', 'core'),
    // 4. Dev mode (running from packages/cli/src via tsx, etc.)
    resolve(here, '..', '..', '..', 'packages', 'core'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'skills')) && existsSync(join(candidate, '.claude-plugin'))) {
      return candidate;
    }
  }

  throw new Error(
    `findCoreSource: could not locate core source tree. Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
  );
}
