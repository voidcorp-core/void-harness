// `void-harness add <pack-name>` — activate an additional pack in the current
// project's .claude/settings.json (enabledPlugins) without touching anything else.

import * as p from '@clack/prompts';
import { CORE_PLUGIN_NAME, findPack, PACKS } from '../lib/packs.js';
import { mergeSettings, readSettings, settingsPathFor, writeSettings } from '../lib/settings.js';
import { patchClaudeMd } from '../lib/claude-md.js';
import { enabledPluginsKey } from '../lib/packs.js';

const DEFAULT_MARKETPLACE_REPO = 'voidcorp-core/void-harness';

export async function add(args: readonly string[]): Promise<void> {
  if (args.length === 0) {
    p.log.error(`Usage: void-harness add <pack-name>`);
    p.log.info(`Available: ${PACKS.map((pk) => pk.name).join(', ')}`);
    process.exit(2);
  }

  const projectRoot = process.cwd();
  const settingsPath = settingsPathFor(projectRoot);
  const existing = await readSettings(settingsPath);
  const currentEnabled = (existing.enabledPlugins ?? {}) as Record<string, unknown>;

  const newlyAdded: string[] = [];
  for (const name of args) {
    const pack = findPack(name);
    if (!pack) {
      p.log.warn(`Unknown pack '${name}', skipping. Available: ${PACKS.map((pk) => pk.name).join(', ')}`);
      continue;
    }
    if (currentEnabled[enabledPluginsKey(pack.name)] === true) {
      p.log.info(`'${pack.name}' is already active.`);
      continue;
    }
    newlyAdded.push(pack.name);
  }

  if (newlyAdded.length === 0) {
    p.log.info('Nothing to add.');
    return;
  }

  // Reconstruct full list of enabled plugins (core + previously enabled + new).
  const enabledNames = new Set<string>([CORE_PLUGIN_NAME]);
  for (const key of Object.keys(currentEnabled)) {
    if (currentEnabled[key] === true) {
      const [name] = key.split('@');
      if (name) enabledNames.add(name);
    }
  }
  for (const name of newlyAdded) enabledNames.add(name);
  const enabledPlugins = Array.from(enabledNames);

  const merged = mergeSettings(existing, {
    enabledPlugins,
    marketplaceRepo: DEFAULT_MARKETPLACE_REPO,
  });
  await writeSettings(settingsPath, merged);

  const enabledPacks = PACKS.filter((pack) => enabledNames.has(pack.name));
  await patchClaudeMd(projectRoot, { enabledPlugins, enabledPacks });

  p.log.success(`Added: ${newlyAdded.join(', ')}`);
  p.log.info('Restart Claude Code to pick up the new plugin.');
}
