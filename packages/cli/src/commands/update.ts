// `void-harness update` — bring a project's harness materializations to the
// current version without the heavier `init --force` (which rewrites everything).
//
//   1. refresh Claude Code's marketplace cache (git pull)
//   2. sync .void/config.json pins to marketplace HEAD (paths/commands/modes untouched)
//   3. re-stage the Codex safety floor (.void/hooks/ + .codex/hooks.json) to the
//      running CLI's version — only on real drift, only when Codex is wired
//
// Use case: after `/plugin marketplace update` inside Claude Code the runtime
// loads the new plugin version but the local pin is unchanged; and after a CLI
// upgrade a Codex project's staged floor scripts lag the shipped ones. This
// command reconciles both in one shot.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CODEX_HOOKS_DIR, refreshCodexFloor } from '../lib/codex-floor.js';
import { CODEX_SKILLS_DIR, wireCodexSkills } from '../lib/codex-skills.js';
import { computePinBumps } from '../lib/pack-config.js';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, MARKETPLACE_REPO } from '../lib/packs.js';
import { findCoreSource } from '../lib/paths.js';
import { fetchPinnedPluginVersion, fetchRemoteMarketplace } from '../lib/remote.js';
import { banner, blank, c, footer, glyph, line, meta, row, status } from '../lib/render.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';


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
  const core = remote.value.plugins.find((p) => p.name === CORE_PLUGIN_NAME);
  const headFetch = core ? fetchPinnedPluginVersion(core, repo) : undefined;
  if (!headFetch?.ok) {
    blank();
    status(`could not resolve the pinned ${CORE_PLUGIN_NAME} version: ${headFetch?.error ?? 'entry missing from catalog'}`, 'err');
    process.exit(1);
  }
  const head = headFetch.value;
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

  // Step 3: re-stage the Codex safety floor to the running CLI's version. The
  // floor scripts ship inside this CLI, so `update` is where a Codex project
  // catches version drift (the marketplace cache/pins above are Claude-only).
  const floorApplied = await refreshCodexFloorStep(projectRoot, opts.dryRun);

  blank();
  if (opts.dryRun) {
    footer(c.dim(`dry-run ${glyph.emdash} no changes written. Drop --dry-run to apply.`));
    return;
  }
  if (
    pinsTouched === 0 &&
    (cacheRefreshed === 'fresh' || cacheRefreshed === 'skipped') &&
    !floorApplied
  ) {
    footer(c.dim(`already at ^${head} ${glyph.emdash} nothing to update`));
    return;
  }
  const parts: string[] = [];
  if (pinsTouched > 0) parts.push(c.green(`${pinsTouched} pin${pinsTouched > 1 ? 's' : ''} bumped`));
  if (cacheRefreshed === 'pulled') parts.push(c.green('cache refreshed'));
  if (cacheRefreshed === 'fresh') parts.push(c.dim('cache already fresh'));
  if (cacheRefreshed === 'missing') parts.push(c.dim('cache not present (Claude Code never ran the plugin here?)'));
  if (cacheRefreshed === 'failed') parts.push(c.yellow('cache pull failed (manual `/plugin marketplace update` in Claude)'));
  if (floorApplied) parts.push(c.green('codex floor refreshed'));

  const claudeTouched = pinsTouched > 0 || cacheRefreshed === 'pulled';
  const tail = claudeTouched ? ` ${glyph.emdash} ${c.bold('restart Claude Code to load the new version')}` : '';
  footer(`${parts.join(' + ')}${tail}`);
}

/**
 * Print the Codex-floor refresh step and report whether files were actually
 * re-staged (true only on a real, non-dry-run refresh). Thin I/O glue over the
 * tested `refreshCodexFloor`: it owns the "is Codex even wired" + "can we locate
 * the source" guards, so `update` never breaks on a Codex-less project or an
 * unlocatable harness source.
 */
async function refreshCodexFloorStep(projectRoot: string, dryRun: boolean): Promise<boolean> {
  if (!existsSync(join(projectRoot, '.codex'))) return false;

  let sourceRoot: string;
  try {
    sourceRoot = await findCoreSource();
  } catch {
    line(`${c.yellow(glyph.up)}  ${c.dim('codex floor'.padEnd(12))}${c.yellow('skipped')}: could not locate the harness source`);
    return false;
  }

  // Skills re-stage alongside the floor: an idempotent overwrite to the running
  // CLI's version, so `update` keeps a Codex project's .agents/skills current.
  if (!dryRun) {
    const n = await wireCodexSkills(projectRoot, sourceRoot);
    line(`${c.green(glyph.check)}  ${c.dim('codex skills'.padEnd(12))}${n} skill(s) staged → ${CODEX_SKILLS_DIR}/`);
  }

  const result = await refreshCodexFloor(projectRoot, sourceRoot, dryRun);
  const drift = result.drift.join(', ');
  if (result.status === 'fresh') {
    line(`${c.green(glyph.check)}  ${c.dim('codex floor'.padEnd(12))}already at CLI version`);
    return false;
  }
  if (result.status === 'would-refresh') {
    line(`${c.yellow(glyph.up)}  ${c.dim('codex floor'.padEnd(12))}${drift} ${c.yellow('will re-stage')}`);
    return false;
  }
  line(`${c.green(glyph.check)}  ${c.dim('codex floor'.padEnd(12))}re-staged (${drift}) → ${CODEX_HOOKS_DIR}/`);
  return true;
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
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    line(`${c.yellow(glyph.up)}  ${c.dim('pins'.padEnd(12))}invalid .void/config.json: ${msg}`);
    return 0;
  }

  // Pure core: which pins move to `head` + the next config. The fs write,
  // rendering, and dry-run are the shell around it.
  const { changes, next } = computePinBumps(config, head);

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

  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
  return changes.length;
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
