// `void-harness check` — compare local plugin versions and (optionally) the
// PHILOSOPHY.md doctrine against the remote marketplace at HEAD.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, MARKETPLACE_REPO, PACKS } from '../lib/packs.js';
import { resolveProjectRoots } from '../lib/project-roots.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import {
  fetchRemoteMarketplace,
  fetchPinnedPluginVersion,
  fetchRemotePhilosophy,
  type RemoteMarketplace,
} from '../lib/remote.js';
import { compareVersions, normalizeVersion } from '../lib/version.js';
import { banner, blank, c, footer, glyph, line, meta, row, status } from '../lib/render.js';


interface LocalConfig {
  readonly core?: string;
  readonly packs?: Record<string, string>;
}

/** The three reads `check` makes of the marketplace, `gh` by default. */
export interface CheckRemote {
  readonly fetchRemoteMarketplace: typeof fetchRemoteMarketplace;
  readonly fetchPinnedPluginVersion: typeof fetchPinnedPluginVersion;
  readonly fetchRemotePhilosophy: typeof fetchRemotePhilosophy;
}

export interface CheckOptions {
  /** The directory the command ran in. The installation is resolved from it. */
  readonly cwd?: string;
  /** What the marketplace answers. A test hands in a remote that needs no network. */
  readonly remote?: CheckRemote;
}

const GH_REMOTE: CheckRemote = {
  fetchRemoteMarketplace,
  fetchPinnedPluginVersion,
  fetchRemotePhilosophy,
};

export async function check(args: readonly string[], options: CheckOptions = {}): Promise<void> {
  const doctrine = args.includes('--doctrine');
  const remote = options.remote ?? GH_REMOTE;
  // The pins, the settings and the installed doctrine belong to the
  // installation, which from a linked worktree is the main checkout.
  const projectRoot = resolveProjectRoots(options.cwd).installRoot;

  const repo = await resolveMarketplaceRepo(projectRoot);
  const local = await readLocalConfig(projectRoot);

  banner('check');
  meta('marketplace', repo);
  blank();

  const marketplace = remote.fetchRemoteMarketplace(repo);
  if (!marketplace.ok) {
    status(`could not fetch remote marketplace: ${marketplace.error}`, 'err');
    line(c.dim('verify `gh auth status` and that you have access to the repo.'));
    process.exit(1);
  }

  const drift = reportVersionDrift(local, marketplace.value, repo, remote);

  if (doctrine) {
    blank();
    await reportDoctrineDrift(projectRoot, marketplace.value, repo, remote);
  }

  if (drift > 0) {
    footer(
      `${c.yellow(`${drift} plugin${drift > 1 ? 's' : ''} behind`)} ${glyph.emdash} run ${c.bold(
        'void-harness update',
      )} ${c.dim('(refreshes the plugin cache + bumps the pins this check measures), then restart Claude Code')}`,
    );
  } else {
    footer(c.dim('all up to date'));
  }
}

async function resolveMarketplaceRepo(projectRoot: string): Promise<string> {
  const settings = await readSettings(settingsPathFor(projectRoot));
  const entry = (settings.extraKnownMarketplaces as Record<string, unknown> | undefined)?.[MARKETPLACE_NAME];
  if (entry && typeof entry === 'object') {
    const source = (entry as { source?: { repo?: string } }).source;
    if (source?.repo) return source.repo;
  }
  return MARKETPLACE_REPO;
}

async function readLocalConfig(projectRoot: string): Promise<LocalConfig> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as LocalConfig;
  } catch {
    return {};
  }
}

function reportVersionDrift(
  local: LocalConfig,
  marketplace: RemoteMarketplace,
  marketplaceRepo: string,
  remote: CheckRemote,
): number {
  const localVersions: Record<string, string | undefined> = {
    [CORE_PLUGIN_NAME]: local.core,
  };
  for (const pack of PACKS) {
    localVersions[pack.name] = local.packs?.[`@voidcorp/${pack.name}`];
  }

  let drift = 0;

  for (const plugin of marketplace.plugins) {
    const declaredRaw = localVersions[plugin.name];
    const localStr = declaredRaw ? normalizeVersion(declaredRaw) : glyph.emdash;
    const remoteFetch = remote.fetchPinnedPluginVersion(plugin, marketplaceRepo);
    if (!remoteFetch.ok) {
      row({ mark: 'info', label: plugin.name, versions: [localStr, glyph.emdash], suffix: c.dim(remoteFetch.error) });
      continue;
    }
    const remoteStr = remoteFetch.value;

    if (!declaredRaw) {
      row({
        mark: 'info',
        label: plugin.name,
        versions: [localStr, remoteStr],
        suffix: c.dim('not installed'),
      });
    } else if (compareVersions(localStr, remoteStr) < 0) {
      drift += 1;
      row({
        mark: 'warn',
        label: plugin.name,
        versions: [localStr, remoteStr],
        suffix: c.yellow('update available'),
      });
    } else {
      row({
        mark: 'ok',
        label: plugin.name,
        versions: [localStr, remoteStr],
        suffix: c.dim('up to date'),
      });
    }
  }

  return drift;
}

async function reportDoctrineDrift(
  projectRoot: string,
  marketplace: RemoteMarketplace,
  marketplaceRepo: string,
  remote: CheckRemote,
): Promise<void> {
  // New home first, previous one until the project runs `update`.
  const migrated = join(projectRoot, '.void', 'installed', 'PHILOSOPHY.md');
  const localPath = existsSync(migrated)
    ? migrated
    : join(projectRoot, '.void', 'PHILOSOPHY.md');
  if (!existsSync(localPath)) {
    status('PHILOSOPHY.md missing locally — run `void-harness init` to install.', 'warn');
    return;
  }
  const localText = await readFile(localPath, 'utf8');
  const fetched = remote.fetchRemotePhilosophy(marketplace, CORE_PLUGIN_NAME, marketplaceRepo);
  if (!fetched.ok) {
    status(`could not fetch remote PHILOSOPHY.md: ${fetched.error}`, 'warn');
    return;
  }
  if (normalizeNewlines(localText) === normalizeNewlines(fetched.value)) {
    status(`PHILOSOPHY.md ${c.dim('in sync')}`);
    return;
  }
  const localLines = localText.split('\n').length;
  const remoteLines = fetched.value.split('\n').length;
  status(
    `PHILOSOPHY.md drift (local ${localLines}L, remote ${remoteLines}L) — run \`void-harness init\` to overwrite`,
    'warn',
  );
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').trimEnd();
}
