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
import { CORE_PLUGIN_NAME, MARKETPLACE_REPO, findPack, PACKS } from '../lib/packs.js';
import {
  marketplaceRepoFrom,
  mergeSettings,
  readSettings,
  settingsPathFor,
  writeSettings,
} from '../lib/settings.js';
import { patchExistingRuntimeDocs } from '../lib/claude-md.js';
import { enabledPluginsKey } from '../lib/packs.js';
import { resolveCorePin } from '../lib/remote.js';


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
  //    used elsewhere in the config
  await syncVoidConfig(projectRoot, newlyAdded, marketplaceRepo);

  // 3. Refresh whichever doctrine docs the project already has (per-runtime;
  //    never resurrects the doc of a runtime this project doesn't target).
  const enabledPacks = PACKS.filter((pack) => enabledNames.has(pack.name));
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

  let config: { core?: string; packs?: Record<string, string> } & Record<string, unknown>;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    p.log.warn(`.void/config.json is unreadable; skipping sync. add will be settings-only.`);
    return;
  }

  // Pin the added packs to the config's canonical version: core's pin (lockstep),
  // else any existing pack pin, else a fresh remote resolve. NEVER a stale
  // hardcoded literal — the old `^0.1.0` fallback froze packs at a wrong version
  // and reintroduced the default-pin-stale friction this repo fixed (#67).
  const resolved = resolveCorePin(marketplaceRepo);
  const pin = config.core ?? Object.values(config.packs ?? {})[0] ?? (resolved ? `^${resolved}` : undefined);
  if (pin === undefined) {
    p.log.warn(
      `core version unresolved (marketplace unreachable): '${addedPacks.join(', ')}' activated in settings only. Run void-harness update after gh auth login to pin it.`,
    );
    return;
  }
  const packs = { ...(config.packs ?? {}) };
  for (const name of addedPacks) {
    packs[`@voidcorp/${name}`] = pin;
  }
  await writeFile(configPath, `${JSON.stringify({ ...config, packs }, null, 2)}\n`);
}
