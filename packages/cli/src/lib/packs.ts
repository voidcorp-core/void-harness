// Static list of packs the CLI knows about. Bumped manually when a new pack
// lands in the marketplace. A future v0.2 may fetch this dynamically from the
// marketplace.json.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
export const MARKETPLACE_NAME = 'void-harness';

/** Core plugin name (always activated). */
export const CORE_PLUGIN_NAME = 'void';

export const PACKS: readonly PackDescriptor[] = [
  {
    name: 'void-monorepo',
    label: 'void-monorepo',
    description: 'Turborepo + Bun monorepo conventions',
    detect: (root) =>
      existsSync(join(root, 'turbo.json')) ||
      existsSync(join(root, 'pnpm-workspace.yaml')) ||
      hasDepLike(root, /^(turbo|@turbo\/)/) ||
      hasDepLike(root, /^bun$/),
  },
  {
    name: 'void-nextjs',
    label: 'void-nextjs',
    description: 'Next.js 16 + PWA conventions (Server Actions, withWebhookSafety, shadcn/Radix UI)',
    detect: (root) => hasDepLike(root, /^next$/),
  },
];

/** Reads dependencies + devDependencies + peerDependencies from package.json. */
function hasDepLike(root: string, pattern: RegExp): boolean {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const all = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    return Object.keys(all).some((dep) => pattern.test(dep));
  } catch {
    return false;
  }
}

/** Resolve a pack name (with or without `void-` prefix) to a descriptor. */
export function findPack(name: string): PackDescriptor | undefined {
  const normalized = name.startsWith('void-') ? name : `void-${name}`;
  return PACKS.find((p) => p.name === normalized || p.name === name);
}

/** Compute the enabledPlugins key for a plugin: `<plugin>@<marketplace>`. */
export function enabledPluginsKey(pluginName: string): string {
  return `${pluginName}@${MARKETPLACE_NAME}`;
}
