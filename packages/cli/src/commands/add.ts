// `void-harness add <pack-name>` — activate an additional pack. Updates:
//   1. .claude/settings.json (enabledPlugins)
//   2. .void/config.json (packs section — same source of truth as init)
//   3. CLAUDE.md (regenerated plugin list)
//
// Marketplace repo is read from existing settings.json (does NOT reset a
// fork or private mirror).

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
  const marketplaceRepo = marketplaceRepoFrom(existing, DEFAULT_MARKETPLACE_REPO);

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

  // 1. Settings.json — full enabled list (core + previous + new)
  const enabledNames = new Set<string>([CORE_PLUGIN_NAME]);
  for (const key of Object.keys(currentEnabled)) {
    if (currentEnabled[key] === true) {
      const [name] = key.split('@');
      if (name) enabledNames.add(name);
    }
  }
  for (const name of newlyAdded) enabledNames.add(name);
  const enabledPlugins = Array.from(enabledNames);

  const merged = mergeSettings(existing, { enabledPlugins, marketplaceRepo });
  await writeSettings(settingsPath, merged);

  // 2. .void/config.json — add packs to the packs map with the same pin
  //    used elsewhere in the config (read it; fall back to ^0.1.0)
  await syncVoidConfig(projectRoot, newlyAdded);

  // 3. CLAUDE.md
  const enabledPacks = PACKS.filter((pack) => enabledNames.has(pack.name));
  await patchClaudeMd(projectRoot, { enabledPlugins, enabledPacks });

  p.log.success(`Added: ${newlyAdded.join(', ')} (marketplace: ${marketplaceRepo})`);
  p.log.info('Restart Claude Code to pick up the new plugin.');
}

async function syncVoidConfig(projectRoot: string, addedPacks: readonly string[]): Promise<void> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) return;   // no config = no sync; init expected first

  let config: { core?: string; packs?: Record<string, string> } & Record<string, unknown>;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    p.log.warn(`.void/config.json is unreadable; skipping sync. add will be settings-only.`);
    return;
  }

  // Use whatever pin the config currently uses (core's pin is the lockstep
  // canonical). Fallback only if core is missing.
  const pin = config.core ?? '^0.1.0';
  const packs = { ...(config.packs ?? {}) };
  for (const name of addedPacks) {
    packs[`@voidcorp/${name}`] = pin;
  }
  await writeFile(configPath, `${JSON.stringify({ ...config, packs }, null, 2)}\n`);
}
