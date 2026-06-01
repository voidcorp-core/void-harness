// `void-harness update` — sync .void/config.json pins to the current
// marketplace HEAD without touching paths / commands / modes.
//
// Use case: after `/plugin marketplace update` inside Claude Code, the
// runtime now loads the new plugin version but the local pin in
// .void/config.json is unchanged. This command makes them match in one
// shot, without the heavier `init --force` (which rewrites everything).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
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

interface UpdateOptions {
  readonly dryRun: boolean;
  readonly skipPins: boolean;
  readonly skipCache: boolean;
}

function parseArgs(args: readonly string[]): UpdateOptions {
  return {
    dryRun: args.includes('--dry-run'),
    skipPins: args.includes('--cache-only'),
    skipCache: args.includes('--pins-only'),
  };
}

export async function update(args: readonly string[]): Promise<void> {
  const opts = parseArgs(args);
  const projectRoot = process.cwd();

  banner('update');

  const repo = await resolveMarketplaceRepo(projectRoot);
  meta('marketplace', repo);

  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) {
    blank();
    status(`could not fetch marketplace: ${remote.error}`, 'err');
    process.exit(1);
  }
  const head = remote.value.plugins[0]?.version;
  if (!head) {
    blank();
    status('marketplace.json has no plugins[0].version', 'err');
    process.exit(1);
  }
  meta('remote', head);
  blank();

  let pinsTouched = 0;
  let cacheRefreshed: 'fresh' | 'pulled' | 'missing' | 'skipped' | 'failed' = 'skipped';

  // Step 1: refresh Claude Code's marketplace cache (git pull).
  if (!opts.skipCache) {
    cacheRefreshed = refreshMarketplaceCache(opts.dryRun);
  }

  // Step 2: bump .void/config.json pins.
  if (!opts.skipPins) {
    pinsTouched = await bumpPins(projectRoot, head, opts.dryRun);
  }

  blank();
  if (opts.dryRun) {
    footer(c.dim(`dry-run ${glyph.emdash} no changes written. Drop --dry-run to apply.`));
    return;
  }
  if (pinsTouched === 0 && (cacheRefreshed === 'fresh' || cacheRefreshed === 'skipped')) {
    footer(c.dim(`already at ^${head} ${glyph.emdash} nothing to update`));
    return;
  }
  const parts: string[] = [];
  if (pinsTouched > 0) parts.push(c.green(`${pinsTouched} pin${pinsTouched > 1 ? 's' : ''} bumped`));
  if (cacheRefreshed === 'pulled') parts.push(c.green('cache refreshed'));
  if (cacheRefreshed === 'fresh') parts.push(c.dim('cache already fresh'));
  if (cacheRefreshed === 'missing') parts.push(c.dim('cache not present (Claude Code never ran the plugin here?)'));
  if (cacheRefreshed === 'failed') parts.push(c.yellow('cache pull failed (manual `/plugin marketplace update` in Claude)'));

  footer(`${parts.join(' + ')} ${glyph.emdash} ${c.bold('restart Claude Code to load the new version')}`);
}

function refreshMarketplaceCache(dryRun: boolean): 'fresh' | 'pulled' | 'missing' | 'failed' {
  const cacheDir = join(homedir(), '.claude', 'plugins', 'marketplaces', MARKETPLACE_NAME);
  if (!existsSync(cacheDir)) {
    line(`${c.dim(glyph.dot)}  ${c.dim('cache'.padEnd(12))}not present at ~/.claude/plugins/marketplaces/${MARKETPLACE_NAME}`);
    return 'missing';
  }

  // Compare local HEAD with remote HEAD via git rev-list cheaply.
  try {
    const before = execFileSync('git', ['-C', cacheDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (dryRun) {
      // Just fetch to see if there are upstream commits, don't pull.
      execFileSync('git', ['-C', cacheDir, 'fetch', '--quiet'], { stdio: 'pipe' });
      const remoteHead = execFileSync('git', ['-C', cacheDir, 'rev-parse', '@{u}'], { encoding: 'utf8' }).trim();
      if (before === remoteHead) {
        line(`${c.green(glyph.check)}  ${c.dim('cache'.padEnd(12))}already at ${before.slice(0, 7)}`);
        return 'fresh';
      }
      line(`${c.yellow(glyph.up)}  ${c.dim('cache'.padEnd(12))}${before.slice(0, 7)} ${c.dim(glyph.to)} ${remoteHead.slice(0, 7)} ${c.yellow('will pull')}`);
      return 'pulled';
    }
    // Fast-forward only pull — refuse to merge or rebase unexpected local commits.
    execFileSync('git', ['-C', cacheDir, 'pull', '--ff-only', '--quiet'], { stdio: 'pipe' });
    const after = execFileSync('git', ['-C', cacheDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (before === after) {
      line(`${c.green(glyph.check)}  ${c.dim('cache'.padEnd(12))}already at ${after.slice(0, 7)}`);
      return 'fresh';
    }
    line(`${c.green(glyph.check)}  ${c.dim('cache'.padEnd(12))}${before.slice(0, 7)} ${c.dim(glyph.to)} ${after.slice(0, 7)} ${c.green('pulled')}`);
    return 'pulled';
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8');
    line(`${c.yellow(glyph.up)}  ${c.dim('cache'.padEnd(12))}${c.yellow('pull failed')}: ${(stderr ?? e.message ?? '').trim().split('\n')[0]}`);
    return 'failed';
  }
}

async function bumpPins(projectRoot: string, head: string, dryRun: boolean): Promise<number> {
  const configPath = join(projectRoot, '.void', 'config.json');
  if (!existsSync(configPath)) {
    line(`${c.dim(glyph.dot)}  ${c.dim('pins'.padEnd(12))}no .void/config.json (run \`void-harness init\` first)`);
    return 0;
  }

  let config: LocalConfig;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as LocalConfig;
  } catch (err) {
    line(`${c.yellow(glyph.up)}  ${c.dim('pins'.padEnd(12))}invalid .void/config.json: ${(err as Error).message}`);
    return 0;
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
    line(`${c.green(glyph.check)}  ${c.dim('pins'.padEnd(12))}already at ^${head}`);
    return 0;
  }

  for (const ch of changes) {
    row({
      mark: 'warn',
      label: ch.name,
      versions: [ch.from, ch.to],
      suffix: dryRun ? c.yellow('will update') : c.green('updated'),
    });
  }

  if (dryRun) return changes.length;

  if (config.core !== undefined) config.core = newPin;
  for (const key of Object.keys(packs)) packs[key] = newPin;
  config.packs = packs;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return changes.length;
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
