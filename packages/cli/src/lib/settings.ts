// Non-destructive read/merge/write for <project>/.claude/settings.json.
// Preserves user-written keys; only touches extraKnownMarketplaces.<our-name>
// and enabledPlugins["<plugin>@<marketplace>"].

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { enabledPluginsKey, MARKETPLACE_NAME } from './packs.js';

interface ClaudeSettings {
  readonly extraKnownMarketplaces?: Record<string, unknown>;
  readonly enabledPlugins?: Record<string, unknown>;
  readonly [k: string]: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface SettingsMutation {
  /** Plugin names to enable (without marketplace suffix). Always includes core. */
  readonly enabledPlugins: readonly string[];
  /** GitHub repo for the marketplace, e.g. `voidcorp-core/void-harness`. */
  readonly marketplaceRepo: string;
}

/** Read the current settings.json, or {} if missing/invalid. */
export async function readSettings(settingsPath: string): Promise<ClaudeSettings> {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Merge our marketplace + plugin activations into settings without touching
 * other keys. Returns the merged object (ready to JSON.stringify).
 */
export function mergeSettings(existing: ClaudeSettings, mutation: SettingsMutation): ClaudeSettings {
  const markets = isObject(existing.extraKnownMarketplaces)
    ? { ...(existing.extraKnownMarketplaces as Record<string, unknown>) }
    : {};
  const plugins = isObject(existing.enabledPlugins)
    ? { ...(existing.enabledPlugins as Record<string, unknown>) }
    : {};

  markets[MARKETPLACE_NAME] = {
    source: {
      source: 'github',
      repo: mutation.marketplaceRepo,
    },
  };

  for (const name of mutation.enabledPlugins) {
    plugins[enabledPluginsKey(name)] = true;
  }

  return {
    ...existing,
    extraKnownMarketplaces: markets,
    enabledPlugins: plugins,
  };
}

export async function writeSettings(settingsPath: string, value: ClaudeSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(value, null, 2)}\n`);
}

export function settingsPathFor(projectRoot: string): string {
  return join(projectRoot, '.claude', 'settings.json');
}

/**
 * Read the marketplace repo from settings.json's extraKnownMarketplaces entry.
 * Returns the fallback if not present — used so add/remove/check/update never
 * silently re-pin a fork or private mirror to the default repo.
 */
export function marketplaceRepoFrom(
  settings: ClaudeSettings,
  fallback: string,
): string {
  const entry = (settings.extraKnownMarketplaces as Record<string, unknown> | undefined)?.[MARKETPLACE_NAME];
  if (entry && typeof entry === 'object') {
    const source = (entry as { source?: { repo?: string } }).source;
    if (source?.repo) return source.repo;
  }
  return fallback;
}
