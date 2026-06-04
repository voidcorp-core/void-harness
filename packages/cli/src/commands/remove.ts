// `void-harness remove <pack-name>` — deactivate a pack. Updates:
//   1. .claude/settings.json (enabledPlugins — delete the key)
//   2. .void/config.json (packs section — delete the pin)
//   3. CLAUDE.md + AGENTS.md (regenerated plugin list, sister docs in parity)
//
// Core (`void`) cannot be removed. Marketplace repo is read from existing
// settings.json (does NOT reset a fork or private mirror).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { CORE_PLUGIN_NAME, findPack, PACKS } from '../lib/packs.js';
import {
  marketplaceRepoFrom,
  mergeSettings,
  readSettings,
  settingsPathFor,
  writeSettings,
} from '../lib/settings.js';
import { patchClaudeMd, patchAgentsMd } from '../lib/claude-md.js';
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
  const marketplaceRepo = marketplaceRepoFrom(existing, DEFAULT_MARKETPLACE_REPO);

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

  // 1. Settings.json
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
    { enabledPlugins, marketplaceRepo },
  );
  await writeSettings(settingsPath, merged);

  // 2. .void/config.json — delete pins for removed packs
  await unsyncVoidConfig(projectRoot, removed);

  // 3. CLAUDE.md + AGENTS.md (keep the sister docs in parity)
  const enabledPacks = PACKS.filter((pack) => enabledNames.has(pack.name));
  await patchClaudeMd(projectRoot, { enabledPlugins, enabledPacks });
  await patchAgentsMd(projectRoot, { enabledPlugins, enabledPacks });

  p.log.success(`Removed: ${removed.join(', ')} (marketplace: ${marketplaceRepo})`);
  p.log.info('Restart Claude Code to drop the plugin.');
}

async function unsyncVoidConfig(projectRoot: string, removedPacks: readonly string[]): Promise<void> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) return;

  let config: { packs?: Record<string, string> } & Record<string, unknown>;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    p.log.warn(`.void/config.json is unreadable; skipping sync. remove will be settings-only.`);
    return;
  }

  const packs = { ...(config.packs ?? {}) };
  for (const name of removedPacks) {
    delete packs[`@voidcorp/${name}`];
  }
  await writeFile(configPath, `${JSON.stringify({ ...config, packs }, null, 2)}\n`);
}
