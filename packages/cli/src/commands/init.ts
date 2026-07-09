// `void-harness init` — wire the current project to the void-harness Claude
// Code marketplace and activate the requested plugins.
//
// What this command does (idempotent):
//   1. Create .void/config.json (paths, commands, modes)
//   2. Copy PHILOSOPHY.md into .void/ (managed)
//   3. Create .void/PROJECT-DOCTRINE.md from template if it does not exist
//   4. Merge `.claude/settings.json` with `extraKnownMarketplaces.void-harness`
//      pointing to the GitHub repo, and `enabledPlugins` for the chosen packs
//   5. Patch CLAUDE.md (and its Codex sister AGENTS.md) with the void-harness
//      block (doctrine imports + skill summary)
//
// This command does NOT copy skills/agents/hooks — Claude Code fetches the
// plugin from the marketplace on session start. Skills appear as
// /harness:tdd, /harness-nextjs:..., etc.

import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findCoreSource } from '../lib/paths.js';
import {
  PACKS,
  CORE_PLUGIN_NAME,
  MARKETPLACE_NAME,
  MARKETPLACE_REPO,
  findPack,
  type PackDescriptor,
} from '../lib/packs.js';
import { mergeSettings, readSettings, settingsPathFor, writeSettings } from '../lib/settings.js';
import { patchClaudeMd, patchAgentsMd } from '../lib/claude-md.js';
import { banner, blank, c, footer, glyph, line, meta } from '../lib/render.js';
import { commandsFor, detectStack, type Stack } from '../lib/stack.js';
import { resolveCorePin } from '../lib/remote.js';
import { checkGh, checkJq, checkMarketplaceAccess, type CheckResult } from '../lib/prerequisites.js';

interface InitOptions {
  readonly explicitPacks: readonly string[];
  readonly allPacks: boolean;
  readonly interactive: boolean;
  readonly force: boolean;
  readonly marketplaceRepo: string;
}

function parseArgs(args: readonly string[]): InitOptions {
  const explicitPacks: string[] = [];
  let allPacks = false;
  let interactive = true;
  let force = false;
  let marketplaceRepo = MARKETPLACE_REPO;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '--pack' && i + 1 < args.length) {
      const next = args[i + 1];
      if (next !== undefined) explicitPacks.push(next);
      i += 1;
    } else if (a === '--all-packs') {
      allPacks = true;
    } else if (a === '--no-interactive') {
      interactive = false;
    } else if (a === '--force') {
      force = true;
    } else if (a === '--marketplace-repo' && i + 1 < args.length) {
      const next = args[i + 1];
      if (next !== undefined) marketplaceRepo = next;
      i += 1;
    }
  }

  // If --pack flags are present, default to non-interactive (script-friendly).
  if (explicitPacks.length > 0 || allPacks) interactive = false;

  return { explicitPacks, allPacks, interactive, force, marketplaceRepo };
}

interface ConfigSeed {
  /** undefined when the marketplace was unreachable: never write a stale pin (#67). */
  readonly pinVersion: string | undefined;
  readonly stack: Stack;
}

export function buildDefaultConfig(seed: ConfigSeed): Record<string, unknown> & { packs: Record<string, string> } {
  const config: Record<string, unknown> & { packs: Record<string, string> } = {
    packs: {} as Record<string, string>,
    stack: { ...seed.stack },
    paths: {
      business: 'apps/*/src/**',
      tests: 'apps/*/src/**/*.test.{ts,tsx}',
      spikes: 'apps/*/scripts/spike-*',
      serverActions: 'apps/*/src/app/(api|actions)/**',
      contracts: 'apps/*/src/lib/contracts/**',
      e2e: 'apps/*/tests/e2e/**',
    },
    commands: commandsFor(seed.stack),
    modes: { tdd: 'auto', codeReview: 'auto' },
  };
  // Only pin `core` when a real version was resolved. An unresolved pin is left
  // absent (surfaced in the final checklist) rather than defaulted to a stale
  // literal, which would silently freeze the install at a wrong version (#67).
  if (seed.pinVersion !== undefined) config.core = `^${seed.pinVersion}`;
  return config;
}

/**
 * The numbered "what's left" checklist printed at the end of init. Pure so it is
 * unit-tested: every unmet prerequisite becomes an impossible-to-miss FAILED
 * line with its remediation, on top of the always-present restart + trust steps.
 */
export function buildFinalChecklist(
  checks: readonly CheckResult[],
  pinResolved: boolean,
): readonly string[] {
  const items: string[] = ['restart Claude Code (skills load on session start)', 'accept the plugin trust prompt on first load'];
  for (const check of checks) {
    if (!check.ok) items.push(`FAILED: ${check.message}${check.fix ? ` — ${check.fix}` : ''}`);
  }
  if (!pinResolved) {
    items.push('FAILED: core version unresolved (marketplace unreachable) — run gh auth login, then void-harness update to pin it');
  }
  return items;
}

export async function init(args: readonly string[]): Promise<void> {
  const opts = parseArgs(args);
  const projectRoot = process.cwd();

  banner('init');
  meta('project', projectRoot);
  meta('marketplace', opts.marketplaceRepo);

  // Resolve seed config: detect consumer's stack + fetch marketplace HEAD
  // version. Both have fallbacks so init never fails for env reasons.
  const stack = detectStack(projectRoot);
  meta('stack', `${stack.packageManager} + ${stack.testRunner}${stack.e2eRunner !== 'none' ? ` + ${stack.e2eRunner}` : ''}`);

  // Prerequisite checks up front: jq (hooks), gh (private marketplace), and the
  // marketplace repo itself. init never FAILS on these (it stays idempotent),
  // but every unmet one is loud here and reappears in the closing checklist so
  // a broken install can't hide behind a "succeeded for env reasons" exit (#67).
  const prereqs: CheckResult[] = [checkJq(), checkGh(), checkMarketplaceAccess(opts.marketplaceRepo)];
  for (const check of prereqs) {
    const mark = check.ok ? c.green(glyph.check) : c.red('x');
    line(`${mark}  ${c.dim(check.name.padEnd(18))}${check.message}`);
    if (!check.ok && check.fix) line(c.dim(`     ${glyph.to} ${check.fix}`));
  }

  const pinVersion = resolveCorePin(opts.marketplaceRepo);
  meta('pin', pinVersion !== undefined ? `^${pinVersion}` : c.red('unresolved (marketplace unreachable, not pinned)'));
  blank();

  // Locate the harness source (for PHILOSOPHY.md + PROJECT-DOCTRINE template).
  const sourceRoot = await findCoreSource();

  // 1. Choose packs
  const packs = await choosePacks(projectRoot, opts);
  const enabledPlugins = [CORE_PLUGIN_NAME, ...packs.map((pk) => pk.name)];

  // 2. Write .void/config.json
  await writeConfig(projectRoot, packs, opts, { pinVersion, stack });

  // 3. Copy PHILOSOPHY.md + create PROJECT-DOCTRINE.md from template
  await installDoctrineFiles(projectRoot, sourceRoot);

  // 4. Merge .claude/settings.json
  const settingsPath = settingsPathFor(projectRoot);
  const existing = await readSettings(settingsPath);
  const merged = mergeSettings(existing, { enabledPlugins, marketplaceRepo: opts.marketplaceRepo });
  await writeSettings(settingsPath, merged);
  line(`${c.green(glyph.check)}  ${c.dim('settings.json'.padEnd(18))}extraKnownMarketplaces.${MARKETPLACE_NAME} + enabledPlugins merged`);

  // 5. Patch CLAUDE.md and its Codex sister AGENTS.md (one doctrine, two runtimes)
  const claudeMdResult = await patchClaudeMd(projectRoot, { enabledPlugins, enabledPacks: packs });
  line(`${c.green(glyph.check)}  ${c.dim('CLAUDE.md'.padEnd(18))}${claudeMdResult}`);
  const agentsMdResult = await patchAgentsMd(projectRoot, { enabledPlugins, enabledPacks: packs });
  line(`${c.green(glyph.check)}  ${c.dim('AGENTS.md'.padEnd(18))}${agentsMdResult}`);

  blank();
  meta('plugins', enabledPlugins.join(', '));

  // Numbered "what's left" checklist. Restart + trust always; every failed
  // prerequisite and an unresolved pin appear as FAILED lines you cannot miss.
  const checklist = buildFinalChecklist(prereqs, pinVersion !== undefined);
  blank();
  line(c.bold('Next steps:'));
  checklist.forEach((item, i) => {
    const failed = item.startsWith('FAILED:');
    const label = `${i + 1}. ${item}`;
    line(`  ${failed ? c.red(label) : c.dim(label)}`);
  });
  footer(`skills appear as ${c.bold('/harness:<name>')}, ${c.bold('/void-<pack>:<name>')}`);
}

async function choosePacks(projectRoot: string, opts: InitOptions): Promise<readonly PackDescriptor[]> {
  if (opts.allPacks) return PACKS;

  if (opts.explicitPacks.length > 0) {
    const resolved: PackDescriptor[] = [];
    for (const name of opts.explicitPacks) {
      const found = findPack(name);
      if (!found) {
        p.log.warn(`Unknown pack '${name}', skipping. Available: ${PACKS.map((pk) => pk.name).join(', ')}`);
        continue;
      }
      resolved.push(found);
    }
    return resolved;
  }

  if (!opts.interactive) return [];

  // Auto-detect + interactive prompt.
  const detected = new Set(PACKS.filter((pack) => pack.detect(projectRoot)).map((pk) => pk.name));
  const detectionLines = PACKS.map((pack) => {
    const sym = detected.has(pack.name) ? '✓' : '✗';
    return `  ${sym} ${pack.name} — ${pack.description}`;
  });
  p.log.message(['Detected project signals:', ...detectionLines].join('\n'));

  const selected = await p.multiselect({
    message: 'Activate packs (core is always active):',
    options: PACKS.map((pack) => {
      const base: { value: string; label: string; hint?: string } = {
        value: pack.name,
        label: pack.label,
      };
      if (detected.has(pack.name)) base.hint = 'detected';
      return base;
    }),
    initialValues: PACKS.filter((pack) => detected.has(pack.name)).map((pk) => pk.name),
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel('Aborted.');
    process.exit(0);
  }

  return PACKS.filter((pack) => (selected as string[]).includes(pack.name));
}

async function writeConfig(
  projectRoot: string,
  packs: readonly PackDescriptor[],
  opts: InitOptions,
  seed: ConfigSeed,
): Promise<void> {
  const voidDir = join(projectRoot, '.void');
  const configPath = join(voidDir, 'config.json');
  await mkdir(voidDir, { recursive: true });

  // undefined pin (marketplace unreachable): activate packs in settings.json but
  // do NOT stamp a stale version pin into config; the checklist flags it (#67).
  const pin = seed.pinVersion !== undefined ? `^${seed.pinVersion}` : undefined;
  const tag = (status: string) =>
    line(`${c.green(glyph.check)}  ${c.dim('.void/config.json'.padEnd(18))}${status}`);

  // --force OR first-time: write the full scaffold seeded with detected stack.
  if (!existsSync(configPath) || opts.force) {
    const config = buildDefaultConfig(seed);
    if (pin !== undefined) for (const pack of packs) config.packs[`@voidcorp/${pack.name}`] = pin;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    tag(pin !== undefined ? 'written' : 'written (versions unpinned, marketplace unreachable)');
    return;
  }

  // Existing config: merge in any newly-selected packs without touching the
  // user's hand-tuned paths/commands/modes or existing pack pins.
  let existing: { packs?: Record<string, string> } & Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    line(`${c.yellow(glyph.up)}  ${c.dim('.void/config.json'.padEnd(18))}unreadable, leaving untouched (use --force to overwrite)`);
    return;
  }
  const currentPacks = { ...(existing.packs ?? {}) };
  // Reuse an existing pack pin as the pin for newly added packs when the remote
  // was unreachable, so an existing well-pinned config stays lockstep instead of
  // gaining a stale literal or `^undefined`.
  const effectivePin = pin ?? (existing.core as string | undefined) ?? Object.values(existing.packs ?? {})[0];
  const added: string[] = [];
  for (const pack of packs) {
    const key = `@voidcorp/${pack.name}`;
    if (currentPacks[key] === undefined) {
      if (effectivePin !== undefined) currentPacks[key] = effectivePin;
      added.push(pack.name);
    }
  }
  if (added.length === 0) {
    tag(c.dim('already has selected packs, unchanged'));
    return;
  }
  const merged = { ...existing, packs: currentPacks };
  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`);
  tag(`merged (added ${c.bold(added.join(', '))}${effectivePin !== undefined ? ` at ${effectivePin}` : ' (unpinned)'})`);
}

async function installDoctrineFiles(projectRoot: string, sourceRoot: string): Promise<void> {
  const voidDir = join(projectRoot, '.void');
  await mkdir(voidDir, { recursive: true });
  const philosophySrc = join(sourceRoot, 'PHILOSOPHY.md');
  const philosophyDst = join(voidDir, 'PHILOSOPHY.md');
  if (existsSync(philosophySrc)) {
    await cp(philosophySrc, philosophyDst);
    line(`${c.green(glyph.check)}  ${c.dim('PHILOSOPHY.md'.padEnd(18))}written (managed)`);
  }
  const templateSrc = join(sourceRoot, 'PROJECT-DOCTRINE.template.md');
  const doctrineDst = join(voidDir, 'PROJECT-DOCTRINE.md');
  if (existsSync(doctrineDst)) {
    line(`${c.dim(glyph.dot)}  ${c.dim('PROJECT-DOCTRINE'.padEnd(18))}${c.dim('exists (preserved)')}`);
  } else if (existsSync(templateSrc)) {
    await cp(templateSrc, doctrineDst);
    line(`${c.green(glyph.check)}  ${c.dim('PROJECT-DOCTRINE'.padEnd(18))}created from template`);
  }
}
