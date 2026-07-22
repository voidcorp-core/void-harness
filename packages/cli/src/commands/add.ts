// `void-harness add <pack-name>` — activate an additional pack. Updates:
//   1. .claude/settings.json (enabledPlugins)
//   2. .void/config.json (packs section — same source of truth as init)
//   3. whichever doctrine docs exist (CLAUDE.md / AGENTS.md), refreshed per-runtime
//
// Marketplace repo is read from existing settings.json (does NOT reset a
// fork or private mirror).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { patchExistingRuntimeDocs } from '../lib/claude-md.js';
import { enabledPluginNames, type PackConfig, resolveEffectivePin, withPackPins } from '../lib/pack-config.js';
import { enabledPluginsKey, findPack, MARKETPLACE_REPO, PACKS } from '../lib/packs.js';
import { resolveCorePin } from '../lib/remote.js';
import {
  marketplaceRepoFrom,
  mergeSettings,
  readSettings,
  settingsPathFor,
  writeSettings,
} from '../lib/settings.js';


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
  const marketplaceRepo = marketplaceRepoFrom(existing, MARKETPLACE_REPO);

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
  const enabledPlugins = enabledPluginNames(currentEnabled, { add: newlyAdded });
  const enabledSet = new Set(enabledPlugins);

  const merged = mergeSettings(existing, { enabledPlugins, marketplaceRepo });
  await writeSettings(settingsPath, merged);

  // 2. .void/config.json — add packs to the packs map with the same pin
  //    used elsewhere in the config
  await syncVoidConfig(projectRoot, newlyAdded, marketplaceRepo);

  // 3. Refresh whichever doctrine docs the project already has (per-runtime;
  //    never resurrects the doc of a runtime this project doesn't target).
  const enabledPacks = PACKS.filter((pack) => enabledSet.has(pack.name));
  await patchExistingRuntimeDocs(projectRoot, { enabledPlugins, enabledPacks });

  p.log.success(`Added: ${newlyAdded.join(', ')} (marketplace: ${marketplaceRepo})`);
  p.log.info('Restart Claude Code to pick up the new plugin.');
}

async function syncVoidConfig(
  projectRoot: string,
  addedPacks: readonly string[],
  marketplaceRepo: string,
): Promise<void> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) return;   // no config = no sync; init expected first

  let config: PackConfig;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    p.log.warn(`.void/config.json is unreadable; skipping sync. add will be settings-only.`);
    return;
  }

  // Pin the added packs to the config's canonical version (single source of the
  // policy: core's pin, else any existing pack pin, else a fresh remote resolve).
  // NEVER a stale literal (#67).
  const resolved = resolveCorePin(marketplaceRepo);
  const pin = resolveEffectivePin(config, resolved ? `^${resolved}` : undefined);
  if (pin === undefined) {
    p.log.warn(
      `core version unresolved (could not derive from marketplace): '${addedPacks.join(', ')}' activated in settings only. Run void-harness update once it is reachable to pin it.`,
    );
    return;
  }
  const next = withPackPins(config, { addNames: addedPacks, pin });
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
}
