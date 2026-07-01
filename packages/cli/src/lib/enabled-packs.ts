import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME } from './packs.js';

const SUFFIX = `@${MARKETPLACE_NAME}`;

/** Pull the enabledPlugins map from one settings.json text, tolerating absence/invalidity. */
function pluginMap(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text) as { enabledPlugins?: unknown };
    const map = parsed.enabledPlugins;
    return typeof map === 'object' && map !== null && !Array.isArray(map)
      ? (map as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Derive the enabled pack names (model `pack` values) from a project's settings.json and its
 * optional settings.local.json. Keys are `<plugin>@<marketplace>`; only our marketplace counts,
 * only truthy values are enabled, the core plugin is dropped (core is never a pack).
 *
 * Returns `undefined` when no file carries an `enabledPlugins` map — "no signal", the caller
 * falls back to the full model. Returns `[]` when packs are declared but none is active (core
 * only). settings.local.json overrides the project file so a local `false` disables a pack.
 */
export function enabledPacksFrom(
  settingsText: string | undefined,
  localText: string | undefined,
): string[] | undefined {
  const project = pluginMap(settingsText);
  const local = pluginMap(localText);
  if (project === undefined && local === undefined) return undefined;

  const merged: Record<string, unknown> = { ...project, ...local };
  const packs = new Set<string>();
  for (const [key, value] of Object.entries(merged)) {
    if (!value || !key.endsWith(SUFFIX)) continue;
    const name = key.slice(0, -SUFFIX.length);
    if (name !== CORE_PLUGIN_NAME) packs.add(name);
  }
  return [...packs].sort();
}

/** IO wrapper: read `<root>/.claude/settings{,.local}.json` and derive the enabled packs. */
export function readEnabledPacks(projectRoot: string): string[] | undefined {
  const read = (rel: string): string | undefined => {
    const path = join(projectRoot, '.claude', rel);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  };
  return enabledPacksFrom(read('settings.json'), read('settings.local.json'));
}
