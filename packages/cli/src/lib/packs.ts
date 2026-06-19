// Static list of packs the CLI knows about. Bumped manually when a new pack
// lands in the marketplace. Order in PACKS controls display order in `list`
// and `init`.
//
// Detection walks monorepo workspaces (pnpm-workspace.yaml, package.json
// "workspaces", bun workspaces) so packs whose stack lives in sub-packages
// (apps/web/package.json with "next", apps/mobile/package.json with "expo")
// are still discovered.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
export const MARKETPLACE_NAME = 'voidcorp';

/** Dedicated catalog repo (pure marketplace, products live in their own repos). */
export const MARKETPLACE_REPO = 'voidcorp-core/void-plugins';

/** The harness source repo — where `feedback push` files inbound issues. */
export const HARNESS_REPO = 'voidcorp-core/void-harness';

/** Core plugin name (always activated). */
export const CORE_PLUGIN_NAME = 'harness';

export const PACKS: readonly PackDescriptor[] = [
  {
    name: 'harness-monorepo',
    label: 'harness-monorepo',
    description: 'Turborepo + Bun monorepo conventions',
    detect: (root) =>
      existsSync(join(root, 'turbo.json')) ||
      existsSync(join(root, 'pnpm-workspace.yaml')) ||
      hasDepLike(root, /^(turbo|@turbo\/)/) ||
      hasDepLike(root, /^bun$/),
  },
  {
    name: 'harness-react',
    label: 'harness-react',
    description: 'React 19 + shadcn/Radix + accessibility-first',
    detect: (root) => hasDepLike(root, /^(react|react-dom)$/),
  },
  {
    name: 'harness-nextjs',
    label: 'harness-nextjs',
    description: 'Next.js 16 App Router conventions',
    detect: (root) => hasDepLike(root, /^next$/),
  },
  {
    name: 'harness-server',
    label: 'harness-server',
    description: 'Server Actions, webhooks, Drizzle, Zod boundaries',
    detect: (root) =>
      hasDepLike(root, /^next$/) ||
      hasDepLike(root, /^(hono|@hono\/)/) ||
      hasDepLike(root, /^drizzle-orm$/) ||
      anyWorkspaceFile(root, ['drizzle.config.ts', 'drizzle.config.js']),
  },
  {
    name: 'harness-pwa',
    label: 'harness-pwa',
    description: 'PWA manifest, service worker, offline-first',
    detect: (root) =>
      anyWorkspaceFile(root, ['public/manifest.webmanifest', 'public/manifest.json']) ||
      hasDepLike(root, /(next-pwa|workbox-window|@serwist\/|serwist)/),
  },
  {
    name: 'harness-mobile',
    label: 'harness-mobile',
    description: 'Expo + React Native + native modules',
    detect: (root) =>
      hasDepLike(root, /^(expo|react-native)$/) ||
      anyWorkspaceFile(root, ['app.config.ts', 'app.json']),
  },
];

interface RawPkg {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly workspaces?: readonly string[] | { packages?: readonly string[] };
}

function readPkg(dir: string): RawPkg | undefined {
  const path = join(dir, 'package.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RawPkg;
  } catch {
    return undefined;
  }
}

/** Resolve workspace globs (apps/*, packages/*) to actual sub-directories one level deep. */
function expandGlob(root: string, pattern: string): string[] {
  // We only support trailing /* — the common workspace pattern. Anything more
  // exotic (apps/**, packages/*/src) is rejected to avoid recursion surprises.
  if (pattern.endsWith('/*')) {
    const base = join(root, pattern.slice(0, -2));
    if (!existsSync(base)) return [];
    try {
      return readdirSync(base)
        .map((name) => join(base, name))
        .filter((p) => statSync(p).isDirectory());
    } catch {
      return [];
    }
  }
  // Bare path (no glob): take as-is if it's a directory.
  const direct = join(root, pattern);
  if (existsSync(direct)) {
    try {
      if (statSync(direct).isDirectory()) return [direct];
    } catch {
      return [];
    }
  }
  return [];
}

function workspaceGlobsFrom(root: string, pkg: RawPkg | undefined): readonly string[] {
  // package.json:workspaces (npm/yarn/bun)
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) return ws;
  if (ws !== undefined) {
    // ws is the object form { packages?: string[] } here
    const packages = (ws as { packages?: readonly string[] }).packages;
    if (Array.isArray(packages)) return packages;
  }
  // pnpm-workspace.yaml: minimal parser, just pull `- 'apps/*'` lines.
  const pnpmPath = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpmPath)) {
    try {
      const text = readFileSync(pnpmPath, 'utf8');
      const globs: string[] = [];
      for (const raw of text.split('\n')) {
        const m = /^\s*-\s*['"]?([^'"\s]+)['"]?/.exec(raw);
        if (m && m[1] !== undefined) globs.push(m[1]);
      }
      if (globs.length > 0) return globs;
    } catch {
      // ignore
    }
  }
  return [];
}

function workspacePkgs(root: string): readonly RawPkg[] {
  const rootPkg = readPkg(root);
  const result: RawPkg[] = [];
  if (rootPkg) result.push(rootPkg);
  for (const glob of workspaceGlobsFrom(root, rootPkg)) {
    for (const dir of expandGlob(root, glob)) {
      const sub = readPkg(dir);
      if (sub) result.push(sub);
    }
  }
  return result;
}

/** True if any workspace package.json (root + apps/* + packages/*) declares a matching dep. */
function hasDepLike(root: string, pattern: RegExp): boolean {
  for (const pkg of workspacePkgs(root)) {
    const all = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    if (Object.keys(all).some((dep) => pattern.test(dep))) return true;
  }
  return false;
}

/** True if any workspace dir (root + apps/* + packages/*) contains one of the listed files. */
function anyWorkspaceFile(root: string, relativePaths: readonly string[]): boolean {
  const dirs: string[] = [root];
  const rootPkg = readPkg(root);
  for (const glob of workspaceGlobsFrom(root, rootPkg)) {
    dirs.push(...expandGlob(root, glob));
  }
  for (const dir of dirs) {
    for (const rel of relativePaths) {
      if (existsSync(join(dir, rel))) return true;
    }
  }
  return false;
}

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
