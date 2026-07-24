// `void-harness remove <pack-name>` — deactivate a pack. Updates:
//   1. .claude/settings.json (enabledPlugins — delete the key)
//   2. .void/config.json (packs section — delete the pin)
//   3. whichever doctrine docs exist (CLAUDE.md / AGENTS.md), refreshed per-runtime
//
// Core (`harness`) cannot be removed. Marketplace repo is read from existing
// settings.json (does NOT reset a fork or private mirror).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { patchExistingRuntimeDocs } from '../lib/claude-md.js';
import { enabledPluginNames, type PackConfig, withPackPins } from '../lib/pack-config.js';
import { CORE_PLUGIN_NAME, enabledPluginsKey, findPack, MARKETPLACE_REPO, PACKS } from '../lib/packs.js';
import {
  marketplaceRepoFrom,
  mergeSettings,
  readSettings,
  settingsPathFor,
  writeSettings,
} from '../lib/settings.js';
import { readInstallReceipt } from '../lib/receipts.js';
import { init } from './init.js';


export async function remove(args: readonly string[]): Promise<void> {
  if (args.length === 0) {
    p.log.error(`Usage: void-harness remove <pack-name>`);
    process.exit(2);
  }

  const projectRoot = process.cwd();
  const receipt = await readInstallReceipt(projectRoot);
  if (receipt?.source === 'local') {
    await removeLocalPacks(projectRoot, args);
    return;
  }
  const settingsPath = settingsPathFor(projectRoot);
  const existing = await readSettings(settingsPath);
  const currentEnabled = { ...((existing.enabledPlugins ?? {}) as Record<string, unknown>) };
  const marketplaceRepo = marketplaceRepoFrom(existing, MARKETPLACE_REPO);

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

  // 1. Settings.json — currentEnabled already has the removed keys deleted.
  const enabledPlugins = enabledPluginNames(currentEnabled);
  const enabledSet = new Set(enabledPlugins);

  const merged = mergeSettings(
    { ...existing, enabledPlugins: currentEnabled },
    { enabledPlugins, marketplaceRepo },
  );
  await writeSettings(settingsPath, merged);

  // 2. .void/config.json — delete pins for removed packs
  await unsyncVoidConfig(projectRoot, removed);

  // 3. Refresh whichever doctrine docs the project already has (per-runtime).
  const enabledPacks = PACKS.filter((pack) => enabledSet.has(pack.name));
  await patchExistingRuntimeDocs(projectRoot, { enabledPlugins, enabledPacks });

  p.log.success(`Removed: ${removed.join(', ')} (marketplace: ${marketplaceRepo})`);
  p.log.info('Restart Claude Code to drop the plugin.');
}

async function configuredPacks(projectRoot: string): Promise<string[]> {
  try {
    const config = JSON.parse(await readFile(join(projectRoot, '.void', 'config.json'), 'utf8')) as PackConfig;
    return Object.keys(config.packs ?? {}).map((key) => key.replace(/^@voidcorp\//, ''));
  } catch {
    return [];
  }
}

async function removeLocalPacks(projectRoot: string, names: readonly string[]): Promise<void> {
  const current = new Set(await configuredPacks(projectRoot));
  const removed: string[] = [];
  for (const name of names) {
    const pack = findPack(name);
    if (!pack) {
      p.log.warn(`Unknown pack '${name}', skipping.`);
    } else if (!current.delete(pack.name)) {
      p.log.info(`'${pack.name}' was not active.`);
    } else {
      removed.push(pack.name);
    }
  }
  if (removed.length === 0) {
    p.log.info('Nothing to remove.');
    return;
  }
  const initArgs = ['--no-interactive', '--replace-packs'];
  for (const name of current) initArgs.push('--pack', name);
  await init(initArgs);
  p.log.success(`Removed locally: ${removed.join(', ')}`);
}

async function unsyncVoidConfig(projectRoot: string, removedPacks: readonly string[]): Promise<void> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) return;

  let config: PackConfig;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    p.log.warn(`.void/config.json is unreadable; skipping sync. remove will be settings-only.`);
    return;
  }

  const next = withPackPins(config, { removeNames: removedPacks });
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
}
