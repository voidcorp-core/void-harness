// Locate the void-harness `packages/core` source tree (after the marketplace
// restructure of 2026-05-30). Used by the CLI for read-only operations like
// listing available skills/hooks; the actual plugin installation is now done
// by Claude Code via the marketplace mechanism (see init.ts).
//
// Strategy:
//  1. Published npm tarball — assets bundled at <pkg>/core-assets/
//  2. Monorepo workspace install — sibling `core` package
//  3. Dev mode — running from packages/cli/{dist,src}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * This CLI's own version, read from its package.json. Used to pin packs that a
 * project activates when no marketplace pin is available (e.g. a Codex install,
 * where skills are materialized from THIS CLI, not a versioned marketplace) — so
 * `.void/config.json` records the packs it actually staged instead of leaving
 * them unpinned/absent. Falls back to 0.0.0 rather than throwing in an install path.
 */
export function cliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', 'package.json'), // dist/main.js -> package root (tarball + build)
    resolve(here, '..', '..', 'package.json'), // src/lib -> package root (dev via tsx)
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
      if (pkg.name === 'voidharness' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return '0.0.0';
}

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
