// `void-harness update` — bring a project's harness materializations to the
// current version without the heavier `init --force` (which rewrites everything).
//
// Local receipts recompile every selected runtime from the running CLI's
// bundled assets, then smoke + publish through the same transaction as init.
// Marketplace receipts keep the legacy cache/pin reconciliation below.
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
import { configPackDirs, CORE_PLUGIN_NAME, MARKETPLACE_NAME, MARKETPLACE_REPO } from '../lib/packs.js';
import { cliVersion, findCoreSource } from '../lib/paths.js';
import { fetchPinnedPluginVersion, fetchRemoteMarketplace } from '../lib/remote.js';
import { banner, blank, c, footer, glyph, line, meta, row, status } from '../lib/render.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import { migrateVoidLayout, untrackDerived } from '../lib/void-migration.js';
import {
  readInstallReceipt,
  type InstallReceipt,
} from '../lib/receipts.js';
import { init } from './init.js';


interface LocalConfig {
  core?: string;
  packs?: Record<string, string>;
  [k: string]: unknown;
}

interface UpdateOptions {
  readonly dryRun: boolean;
  readonly skipPins: boolean;
  readonly skipCache: boolean;
  /** Explicit opt-in: rewrite the index to drop regenerated content. Never implied. */
  readonly untrackDerived: boolean;
  /**
   * Overwrite a managed file the receipt cannot prove this install wrote. It is
   * what `init` tells the operator to do when it refuses one, so `update` has to
   * accept it — otherwise the printed remedy has no way of being applied.
   */
  readonly force: boolean;
}

function parseArgs(args: readonly string[]): UpdateOptions {
  return {
    dryRun: args.includes('--dry-run'),
    skipPins: args.includes('--cache-only'),
    skipCache: args.includes('--pins-only'),
    untrackDerived: args.includes('--untrack-derived'),
    force: args.includes('--force'),
  };
}

export async function update(args: readonly string[]): Promise<void> {
  const opts = parseArgs(args);
  const projectRoot = process.cwd();
  // Layout first, and on every install source: this is not a marketplace concern.
  // It also runs before the receipt is read, since the receipt itself is observed
  // state and moves with the rest.
  await reportVoidMigration(projectRoot, opts.dryRun);
  if (opts.untrackDerived) await reportUntrackDerived(projectRoot, opts.dryRun);
  const receipt = await readInstallReceipt(projectRoot);
  if (updateModeFor(receipt) === 'local' && receipt !== undefined) {
    await updateLocal(projectRoot, receipt, opts.dryRun, opts.force);
    return;
  }

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

export function updateModeFor(receipt: InstallReceipt | undefined): InstallReceipt['source'] {
  return receipt?.source ?? 'marketplace';
}

/**
 * Move observed state under `.void/local/` and install the managed ignore block,
 * reporting what moved. Silent on a project that is already migrated, so a
 * routine update does not grow a paragraph about a one-time change.
 */
async function reportVoidMigration(projectRoot: string, dryRun: boolean): Promise<void> {
  const result = await migrateVoidLayout(projectRoot, dryRun);
  if (result.moved.length === 0 && result.conflicts.length === 0 && !result.gitignoreTouched) return;

  const verb = dryRun ? 'would move' : 'moved';
  if (result.moved.length > 0) {
    line(`${c.green(glyph.check)}  ${c.dim('layout'.padEnd(12))}${verb} ${result.moved.length} observed path(s) ${c.dim(glyph.to)} .void/local/ (${result.moved.join(', ')})`);
    if (!dryRun) {
      // Anything that was committed now shows as a deletion. Saying so is the
      // difference between a clean commit and a confusing `git status`.
      line(`${c.dim(' '.repeat(4))}${c.dim('git may show these as deletions — commit them; the new path is ignored')}`);
    }
  }
  if (result.gitignoreTouched) {
    line(`${c.green(glyph.check)}  ${c.dim('gitignore'.padEnd(12))}${dryRun ? 'would write' : 'wrote'} the managed block (.void/local/ ignored, the rest of .void/ tracked)`);
  }
  for (const entry of result.conflicts) {
    line(`${c.yellow(glyph.up)}  ${c.dim('layout'.padEnd(12))}${c.yellow('left in place')}: .void/${entry} — .void/local/${entry} already exists; merge or delete one, readers still fall back`);
  }
}

/**
 * Report the explicit untrack. Only ever reached behind `--untrack-derived`:
 * the files stay on disk, the index forgets them, and the project commits the
 * result — which is why this is offered rather than done.
 */
async function reportUntrackDerived(projectRoot: string, dryRun: boolean): Promise<void> {
  const result = await untrackDerived(projectRoot, dryRun);
  if (result.error !== undefined) {
    line(`${c.yellow(glyph.up)}  ${c.dim('untrack'.padEnd(12))}${c.yellow('skipped')}: ${result.error}`);
    return;
  }
  if (result.untracked.length === 0) {
    line(`${c.dim(glyph.dot)}  ${c.dim('untrack'.padEnd(12))}${c.dim('no regenerated content in the index')}`);
    return;
  }
  const verb = dryRun ? 'would drop' : 'dropped';
  line(`${c.green(glyph.check)}  ${c.dim('untrack'.padEnd(12))}${verb} ${result.untracked.length} regenerated file(s) from the index (kept on disk)`);
  if (!dryRun) {
    line(`${c.dim(' '.repeat(4))}${c.dim('review and commit the staged deletions; `void-harness install` regenerates them anywhere')}`);
  }
}

/**
 * The argv `update` hands to `init`.
 *
 * `--force` is forwarded rather than dropped. Reported from a real consumer
 * project: `init` refuses to overwrite a managed file it cannot prove it wrote
 * and prints "preserve it or re-run with --force", but `update` never parsed
 * the flag nor passed it on — so the remedy the tool printed could not be
 * applied through the command that printed it, and the operator was left with
 * an instruction that does nothing. An impossible instruction is worse than
 * none, because it costs the reader their trust in every other message.
 */
export function localInitArgs(
  receipt: InstallReceipt,
  packs: readonly string[],
  options: { readonly force: boolean },
): string[] {
  const args = [
    '--no-interactive',
    '--replace-packs',
    '--runtime',
    receipt.runtimes.join(','),
  ];
  for (const pack of packs) args.push('--pack', pack);
  if (options.force) args.push('--force');
  return args;
}

async function updateLocal(
  projectRoot: string,
  receipt: InstallReceipt,
  dryRun: boolean,
  force: boolean,
): Promise<void> {
  let packs: string[] = [];
  try {
    const config = JSON.parse(await readFile(join(projectRoot, '.void', 'config.json'), 'utf8')) as {
      packs?: Record<string, string>;
    };
    packs = Object.keys(config.packs ?? {}).map((key) => key.replace(/^@voidcorp\//, ''));
  } catch {
    // init will surface the invalid/missing config and rebuild only when safe.
  }
  banner('update');
  meta('source', 'bundled local package');
  meta('installed', receipt.version);
  meta('available', cliVersion());
  if (dryRun) {
    blank();
    footer(c.dim('dry-run — local assets would be recompiled, smoked and reconciled transactionally'));
    return;
  }
  await init(localInitArgs(receipt, packs, { force }));
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
  // CLI's version, so `update` keeps a Codex project's .agents/skills current —
  // core plus whatever packs the config activated.
  if (!dryRun) {
    let packDirs: string[] = [];
    try {
      const cfg = JSON.parse(await readFile(join(projectRoot, '.void', 'config.json'), 'utf8'));
      packDirs = configPackDirs(cfg);
    } catch {
      // no/unreadable config -> core skills only
    }
    const n = await wireCodexSkills(projectRoot, sourceRoot, packDirs);
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
