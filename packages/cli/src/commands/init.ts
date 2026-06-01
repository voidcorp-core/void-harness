// `void-harness init` — wire the current project to the void-harness Claude
// Code marketplace and activate the requested plugins.
//
// What this command does (idempotent):
//   1. Create .void/config.json (paths, commands, modes)
//   2. Copy PHILOSOPHY.md into .void/ (managed)
//   3. Create .void/PROJECT-DOCTRINE.md from template if it does not exist
//   4. Merge `.claude/settings.json` with `extraKnownMarketplaces.void-harness`
//      pointing to the GitHub repo, and `enabledPlugins` for the chosen packs
//   5. Patch CLAUDE.md with the void-harness block (@imports + skill summary)
//
// This command does NOT copy skills/agents/hooks — Claude Code fetches the
// plugin from the marketplace on session start. Skills appear as
// /void:tdd, /void-nextjs:..., etc.

import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findCoreSource } from '../lib/paths.js';
import {
  PACKS,
  CORE_PLUGIN_NAME,
  MARKETPLACE_NAME,
  findPack,
  type PackDescriptor,
} from '../lib/packs.js';
import { mergeSettings, readSettings, settingsPathFor, writeSettings } from '../lib/settings.js';
import { patchClaudeMd } from '../lib/claude-md.js';
import { banner, blank, c, footer, glyph, line, meta } from '../lib/render.js';

interface InitOptions {
  readonly explicitPacks: readonly string[];
  readonly allPacks: boolean;
  readonly interactive: boolean;
  readonly force: boolean;
  readonly marketplaceRepo: string;
}

const DEFAULT_MARKETPLACE_REPO = 'voidcorp-core/void-harness';

function parseArgs(args: readonly string[]): InitOptions {
  const explicitPacks: string[] = [];
  let allPacks = false;
  let interactive = true;
  let force = false;
  let marketplaceRepo = DEFAULT_MARKETPLACE_REPO;

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

const DEFAULT_CONFIG = {
  core: '^0.1.0',
  packs: {} as Record<string, string>,
  stack: { packageManager: 'bun', testRunner: 'vitest', e2eRunner: 'playwright' },
  paths: {
    business: 'apps/*/src/**',
    tests: 'apps/*/src/**/*.test.{ts,tsx}',
    spikes: 'apps/*/scripts/spike-*',
    serverActions: 'apps/*/src/app/(api|actions)/**',
    contracts: 'apps/*/src/lib/contracts/**',
    e2e: 'apps/*/tests/e2e/**',
  },
  commands: {
    typecheck: 'bunx tsc --noEmit',
    testUnit: 'bunx vitest run',
    testE2e: 'bunx playwright test',
    mutation: 'bunx stryker run',
  },
  modes: { tdd: 'auto' as const, codeReview: 'auto' as const },
} as const;

export async function init(args: readonly string[]): Promise<void> {
  const opts = parseArgs(args);
  const projectRoot = process.cwd();

  banner('init');
  meta('project', projectRoot);
  meta('marketplace', opts.marketplaceRepo);
  blank();

  // Locate the harness source (for PHILOSOPHY.md + PROJECT-DOCTRINE template).
  const sourceRoot = await findCoreSource();

  // 1. Choose packs
  const packs = await choosePacks(projectRoot, opts);
  const enabledPlugins = [CORE_PLUGIN_NAME, ...packs.map((pk) => pk.name)];

  // 2. Write .void/config.json
  await writeConfig(projectRoot, packs, opts);

  // 3. Copy PHILOSOPHY.md + create PROJECT-DOCTRINE.md from template
  await installDoctrineFiles(projectRoot, sourceRoot);

  // 4. Merge .claude/settings.json
  const settingsPath = settingsPathFor(projectRoot);
  const existing = await readSettings(settingsPath);
  const merged = mergeSettings(existing, { enabledPlugins, marketplaceRepo: opts.marketplaceRepo });
  await writeSettings(settingsPath, merged);
  line(`${c.green(glyph.check)}  ${c.dim('settings.json'.padEnd(18))}extraKnownMarketplaces.${MARKETPLACE_NAME} + enabledPlugins merged`);

  // 5. Patch CLAUDE.md
  const claudeMdResult = await patchClaudeMd(projectRoot, { enabledPlugins, enabledPacks: packs });
  line(`${c.green(glyph.check)}  ${c.dim('CLAUDE.md'.padEnd(18))}${claudeMdResult}`);

  blank();
  meta('plugins', enabledPlugins.join(', '));
  footer(`restart Claude Code ${glyph.emdash} skills appear as ${c.bold('/void:<name>')}, ${c.bold('/void-<pack>:<name>')}`);
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

async function writeConfig(projectRoot: string, packs: readonly PackDescriptor[], opts: InitOptions): Promise<void> {
  const voidDir = join(projectRoot, '.void');
  const configPath = join(voidDir, 'config.json');
  await mkdir(voidDir, { recursive: true });

  const tag = (status: string) =>
    line(`${c.green(glyph.check)}  ${c.dim('.void/config.json'.padEnd(18))}${status}`);

  // --force OR first-time: write the full scaffold from DEFAULT_CONFIG.
  if (!existsSync(configPath) || opts.force) {
    const config = structuredClone(DEFAULT_CONFIG) as Record<string, unknown> & {
      packs: Record<string, string>;
    };
    for (const pack of packs) config.packs[`@voidcorp/${pack.name}`] = '^0.1.0';
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    tag('written');
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
  const added: string[] = [];
  for (const pack of packs) {
    const key = `@voidcorp/${pack.name}`;
    if (currentPacks[key] === undefined) {
      currentPacks[key] = '^0.1.0';
      added.push(pack.name);
    }
  }
  if (added.length === 0) {
    tag(c.dim('already has selected packs, unchanged'));
    return;
  }
  const merged = { ...existing, packs: currentPacks };
  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`);
  tag(`merged (added ${c.bold(added.join(', '))})`);
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
