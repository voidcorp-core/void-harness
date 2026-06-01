// `void-harness update` — sync .void/config.json pins to the current
// marketplace HEAD without touching paths / commands / modes.
//
// Use case: after `/plugin marketplace update` inside Claude Code, the
// runtime now loads the new plugin version but the local pin in
// .void/config.json is unchanged. This command makes them match in one
// shot, without the heavier `init --force` (which rewrites everything).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import { fetchRemoteMarketplace } from '../lib/remote.js';
import { compareVersions, normalizeVersion } from '../lib/version.js';
import { banner, blank, c, footer, glyph, line, meta, row, status } from '../lib/render.js';

const DEFAULT_MARKETPLACE_REPO = 'voidcorp-core/void-harness';

interface LocalConfig {
  core?: string;
  packs?: Record<string, string>;
  [k: string]: unknown;
}

export async function update(args: readonly string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const projectRoot = process.cwd();

  banner('update');

  const repo = await resolveMarketplaceRepo(projectRoot);
  meta('marketplace', repo);

  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) {
    blank();
    status('no .void/config.json — run `void-harness init` first', 'err');
    process.exit(1);
  }

  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) {
    blank();
    status(`could not fetch marketplace: ${remote.error}`, 'err');
    process.exit(1);
  }

  // Lockstep model: every plugin shares one version. First plugin is canonical.
  const head = remote.value.plugins[0]?.version;
  if (!head) {
    blank();
    status('marketplace.json has no plugins[0].version', 'err');
    process.exit(1);
  }
  meta('remote', head);
  blank();

  let config: LocalConfig;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as LocalConfig;
  } catch (err) {
    status(`invalid .void/config.json: ${(err as Error).message}`, 'err');
    process.exit(1);
  }

  const newPin = `^${head}`;
  const changes: Array<{ name: string; from: string; to: string }> = [];

  if (config.core !== undefined) {
    const fromCore = normalizeVersion(config.core);
    if (compareVersions(fromCore, head) !== 0) {
      changes.push({ name: CORE_PLUGIN_NAME, from: fromCore, to: head });
    }
  }

  const packs = config.packs ?? {};
  for (const [key, declared] of Object.entries(packs)) {
    const from = normalizeVersion(declared);
    if (compareVersions(from, head) !== 0) {
      const packName = key.replace(/^@voidcorp\//, '');
      changes.push({ name: packName, from, to: head });
    }
  }

  if (changes.length === 0) {
    footer(c.dim(`already at ^${head} ${glyph.emdash} nothing to update`));
    return;
  }

  for (const ch of changes) {
    row({
      mark: 'warn',
      label: ch.name,
      versions: [ch.from, ch.to],
      suffix: c.yellow('will update'),
    });
  }

  if (dryRun) {
    blank();
    footer(c.dim(`dry-run ${glyph.emdash} no changes written. Drop --dry-run to apply.`));
    return;
  }

  // Apply: bump core + every pack pin to ^<head>.
  if (config.core !== undefined) config.core = newPin;
  for (const key of Object.keys(packs)) packs[key] = newPin;
  config.packs = packs;

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  blank();
  footer(`${c.green(`${changes.length} pin${changes.length > 1 ? 's' : ''} bumped`)} to ${c.bold(newPin)}`);
}

async function resolveMarketplaceRepo(projectRoot: string): Promise<string> {
  const settings = await readSettings(settingsPathFor(projectRoot));
  const entry = (settings.extraKnownMarketplaces as Record<string, unknown> | undefined)?.[MARKETPLACE_NAME];
  if (entry && typeof entry === 'object') {
    const source = (entry as { source?: { repo?: string } }).source;
    if (source?.repo) return source.repo;
  }
  return DEFAULT_MARKETPLACE_REPO;
}
