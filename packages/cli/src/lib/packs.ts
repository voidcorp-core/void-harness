// Static list of packs the CLI knows about. Bumped manually when a new pack
// lands in the marketplace. Order in PACKS controls display order in `list`
// and `init`.
//
// Detection walks monorepo workspaces (pnpm-workspace.yaml, package.json
// "workspaces", bun workspaces) so packs whose stack lives in sub-packages
// (apps/web/package.json with "next", apps/mobile/package.json with "expo")
// are still discovered.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceHasDependency, workspaceHasFile } from './workspace.js';

export interface PackDescriptor {
  /** Plugin name as it appears in marketplace.json (`name@<marketplace>` for enabledPlugins). */
  readonly name: string;
  /** Short human-readable label shown in prompts. */
  readonly label: string;
  /** One-line description shown in prompts and `list`. */
  readonly description: string;
  /**
   * Auto-detection signal — given the path of the project root, return true if
   * the heuristic for this pack matches.
   */
  readonly detect: (projectRoot: string) => boolean;
}

/** Marketplace name used in `extraKnownMarketplaces` and `enabledPlugins`. */
export const MARKETPLACE_NAME = 'voidcorp';

/** Self-hosted marketplace: this repo IS the catalog. `.claude-plugin/marketplace.json`
 *  at the root lists every plugin as a local subdirectory (`./packages/core`, ...). */
export const MARKETPLACE_REPO = 'voidcorp-core/void-harness';

/** Core plugin name (always activated). */
export const CORE_PLUGIN_NAME = 'harness';

/** The capability pack directory (`pack-<x>`) for a marketplace plugin name
 *  (`harness-<x>`). Core or a non-pack name maps to undefined. */
export function packDirForName(pluginName: string): string | undefined {
  if (pluginName === CORE_PLUGIN_NAME || !pluginName.startsWith('harness-')) return undefined;
  return pluginName.replace(/^harness-/, 'pack-');
}

/** The pack dirs a `.void/config.json` activates (its `packs` keys are
 *  `@voidcorp/harness-<x>`). Core is not a pack. */
export function configPackDirs(config: { packs?: Record<string, string> }): string[] {
  const dirs: string[] = [];
  for (const key of Object.keys(config.packs ?? {})) {
    const dir = packDirForName(key.replace(/^@voidcorp\//, ''));
    if (dir) dirs.push(dir);
  }
  return dirs;
}

export const PACKS: readonly PackDescriptor[] = [
  {
    name: 'harness-monorepo',
    label: 'harness-monorepo',
    description: 'Turborepo monorepo conventions',
    detect: (root) =>
      existsSync(join(root, 'turbo.json')) ||
      existsSync(join(root, 'pnpm-workspace.yaml')) ||
      workspaceHasDependency(root, /^(turbo|@turbo\/)/) ||
      workspaceHasDependency(root, /^bun$/),
  },
  {
    name: 'harness-react',
    label: 'harness-react',
    description: 'React 19 + shadcn/Radix + accessibility',
    detect: (root) => workspaceHasDependency(root, /^(react|react-dom)$/),
  },
  {
    name: 'harness-nextjs',
    label: 'harness-nextjs',
    description: 'Next.js 16 App Router conventions',
    detect: (root) => workspaceHasDependency(root, /^next$/),
  },
  {
    name: 'harness-server',
    label: 'harness-server',
    description: 'Server Actions, webhooks, Drizzle, Zod boundaries',
    detect: (root) =>
      workspaceHasDependency(root, /^next$/) ||
      workspaceHasDependency(root, /^(hono|@hono\/)/) ||
      workspaceHasDependency(root, /^drizzle-orm$/) ||
      workspaceHasFile(root, ['drizzle.config.ts', 'drizzle.config.js']),
  },
  {
    name: 'harness-pwa',
    label: 'harness-pwa',
    description: 'PWA manifest, service worker, offline-first',
    detect: (root) =>
      workspaceHasFile(root, ['public/manifest.webmanifest', 'public/manifest.json']) ||
      workspaceHasDependency(root, /(next-pwa|workbox-window|@serwist\/|serwist)/),
  },
  {
    name: 'harness-mobile',
    label: 'harness-mobile',
    description: 'Expo + React Native + native modules',
    detect: (root) =>
      workspaceHasDependency(root, /^(expo|react-native)$/) ||
      workspaceHasFile(root, ['app.config.ts', 'app.json']),
  },
];

/**
 * Resolve a pack name to its descriptor. Accepts every form a user might type:
 * the bare stack (`nextjs`), the plugin name (`harness-nextjs`), and the npm /
 * directory form documented in the README (`pack-nextjs`).
 */
export function findPack(name: string): PackDescriptor | undefined {
  const stack = name.replace(/^(harness-|void-|pack-)/, '');
  const normalized = `harness-${stack}`;
  return PACKS.find((p) => p.name === normalized || p.name === name);
}

/** Compute the enabledPlugins key for a plugin: `<plugin>@<marketplace>`. */
export function enabledPluginsKey(pluginName: string): string {
  return `${pluginName}@${MARKETPLACE_NAME}`;
}
