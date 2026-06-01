// `void-harness check` — compare local plugin versions and (optionally) the
// PHILOSOPHY.md doctrine against the remote marketplace at HEAD.
//
// Local sources:
//   - .void/config.json (core, packs)
//   - .void/PHILOSOPHY.md (when --doctrine)
//   - .claude/settings.json (for marketplace repo override)
// Remote sources (via gh api):
//   - .claude-plugin/marketplace.json
//   - packages/core/PHILOSOPHY.md (when --doctrine)
//
// Exit non-zero only when remote could not be fetched. Drift itself is a
// warning — the user decides when to update via `/plugin marketplace update`.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, PACKS } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import {
  fetchRemoteMarketplace,
  fetchRemotePhilosophy,
  type RemoteMarketplace,
} from '../lib/remote.js';
import { compareVersions, normalizeVersion } from '../lib/version.js';

const DEFAULT_MARKETPLACE_REPO = 'voidcorp-core/void-harness';

interface LocalConfig {
  readonly core?: string;
  readonly packs?: Record<string, string>;
}

export async function check(args: readonly string[]): Promise<void> {
  const doctrine = args.includes('--doctrine');
  const projectRoot = process.cwd();

  const repo = await resolveMarketplaceRepo(projectRoot);
  const local = await readLocalConfig(projectRoot);

  p.intro('void-harness check');
  p.log.info(`marketplace: ${repo}`);

  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) {
    p.log.error(`could not fetch remote marketplace: ${remote.error}`);
    p.log.info('verify `gh auth status` and that you have access to the repo.');
    process.exit(1);
  }

  reportVersionDrift(local, remote.value);

  if (doctrine) {
    await reportDoctrineDrift(projectRoot, repo);
  }

  p.outro('To fetch new plugin versions, run `/plugin marketplace update` inside Claude Code.');
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

async function readLocalConfig(projectRoot: string): Promise<LocalConfig> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as LocalConfig;
  } catch {
    return {};
  }
}

function reportVersionDrift(local: LocalConfig, remote: RemoteMarketplace): void {
  const localVersions: Record<string, string | undefined> = {
    [CORE_PLUGIN_NAME]: local.core,
  };
  for (const pack of PACKS) {
    localVersions[pack.name] = local.packs?.[`@voidcorp/${pack.name}`];
  }

  let drift = 0;
  let upToDate = 0;

  p.log.message('Plugins:');
  for (const plugin of remote.plugins) {
    const localRaw = localVersions[plugin.name];
    const localNorm = localRaw ? normalizeVersion(localRaw) : '—';
    const remoteNorm = plugin.version;

    let mark = '?';
    let suffix = '';
    if (!localRaw) {
      mark = '·';
      suffix = '(not installed)';
    } else if (compareVersions(localNorm, remoteNorm) < 0) {
      mark = '↑';
      suffix = '← UPDATE';
      drift += 1;
    } else {
      mark = '✓';
      upToDate += 1;
    }

    p.log.message(
      `  ${mark} ${plugin.name.padEnd(16)} local ${localNorm.padEnd(8)} remote ${remoteNorm.padEnd(8)} ${suffix}`,
    );
  }

  p.log.message('');
  if (drift > 0) {
    p.log.warn(
      `${drift} plugin(s) behind remote. Run \`/plugin marketplace update\` inside Claude Code.`,
    );
  } else {
    p.log.success(`${upToDate} plugin(s) up to date.`);
  }
}

async function reportDoctrineDrift(projectRoot: string, repo: string): Promise<void> {
  const localPath = join(projectRoot, '.void', 'PHILOSOPHY.md');
  if (!existsSync(localPath)) {
    p.log.warn('PHILOSOPHY.md missing locally — run `void-harness init` to install.');
    return;
  }
  const localText = await readFile(localPath, 'utf8');
  const remote = fetchRemotePhilosophy(repo);
  if (!remote.ok) {
    p.log.warn(`could not fetch remote PHILOSOPHY.md: ${remote.error}`);
    return;
  }
  if (normalizeNewlines(localText) === normalizeNewlines(remote.value)) {
    p.log.success('PHILOSOPHY.md: in sync with remote');
    return;
  }
  const localLines = localText.split('\n').length;
  const remoteLines = remote.value.split('\n').length;
  p.log.warn(
    `PHILOSOPHY.md: DRIFT detected (local ${localLines} lines, remote ${remoteLines} lines). ` +
      'Run `void-harness init` to overwrite PHILOSOPHY.md (PROJECT-DOCTRINE.md is preserved).',
  );
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').trimEnd();
}
