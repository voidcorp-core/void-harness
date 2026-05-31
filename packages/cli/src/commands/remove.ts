// `void-harness remove <pack-name>` — deactivate a pack in the current
// project's .claude/settings.json. Core (`void`) cannot be removed by this
// command — it is foundational.

import * as p from '@clack/prompts';
import { CORE_PLUGIN_NAME, findPack, PACKS } from '../lib/packs.js';
import { mergeSettings, readSettings, settingsPathFor, writeSettings } from '../lib/settings.js';
import { patchClaudeMd } from '../lib/claude-md.js';
import { enabledPluginsKey } from '../lib/packs.js';

const DEFAULT_MARKETPLACE_REPO = 'voidcorp-core/void-harness';

export async function remove(args: readonly string[]): Promise<void> {
  if (args.length === 0) {
    p.log.error(`Usage: void-harness remove <pack-name>`);
    process.exit(2);
  }

  const projectRoot = process.cwd();
  const settingsPath = settingsPathFor(projectRoot);
  const existing = await readSettings(settingsPath);
  const currentEnabled = { ...((existing.enabledPlugins ?? {}) as Record<string, unknown>) };

  const removed: string[] = [];
  for (const name of args) {
    const pack = findPack(name);
    if (!pack) {
      p.log.warn(`Unknown pack '${name}', skipping.`);
      continue;
    }
    if (pack.name === CORE_PLUGIN_NAME) {
      p.log.warn(`Cannot remove '${CORE_PLUGIN_NAME}' (core). Skipping.`);
      continue;
    }
    const key = enabledPluginsKey(pack.name);
    if (currentEnabled[key] === true) {
      delete currentEnabled[key];
      removed.push(pack.name);
    } else {
      p.log.info(`'${pack.name}' was not active.`);
    }
  }

  if (removed.length === 0) {
    p.log.info('Nothing to remove.');
    return;
  }

  const enabledNames = new Set<string>([CORE_PLUGIN_NAME]);
  for (const key of Object.keys(currentEnabled)) {
    if (currentEnabled[key] === true) {
      const [name] = key.split('@');
      if (name) enabledNames.add(name);
    }
  }
  const enabledPlugins = Array.from(enabledNames);

  const merged = mergeSettings(
    { ...existing, enabledPlugins: currentEnabled },
    { enabledPlugins, marketplaceRepo: DEFAULT_MARKETPLACE_REPO },
  );
  await writeSettings(settingsPath, merged);

  const enabledPacks = PACKS.filter((pack) => enabledNames.has(pack.name));
  await patchClaudeMd(projectRoot, { enabledPlugins, enabledPacks });

  p.log.success(`Removed: ${removed.join(', ')}`);
  p.log.info('Restart Claude Code to drop the plugin.');
}
