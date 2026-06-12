// `void-harness install --global` — install the void harness as a
// Claude Code plugin at the user-global level: ~/.claude-plugin/plugins/void/.
//
// This is the ESCAPE HATCH. The recommended flow is `void-harness init`
// which installs the same plugin locally inside <cwd>/.claude/plugins/.

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findCoreSource } from '../lib/paths.js';

interface InstallOptions {
  readonly global: boolean;
  readonly dryRun: boolean;
}

function parseArgs(args: readonly string[]): InstallOptions {
  return {
    global: args.includes('--global'),
    dryRun: args.includes('--dry-run'),
  };
}

// See packages/cli/src/commands/init.ts for the rationale on `harness`.
const PLUGIN_NAME = 'harness';
const FALLBACK_VERSION = '0.0.0';

interface CoreManifest {
  readonly version: string;
  readonly hooks?: unknown;
}

/**
 * Read the bundled core plugin manifest. The committed packages/core
 * plugin.json is the single source of truth for BOTH the version and the hook
 * wiring; the global install mirrors it verbatim (hook commands already use
 * ${CLAUDE_PLUGIN_ROOT}, which resolves under the global plugin root too). This
 * is deliberately NOT a hand-maintained copy — a second copy drifts (it once
 * shipped a global install missing every new hook).
 */
async function readCoreManifest(sourceRoot: string): Promise<CoreManifest> {
  const manifestPath = join(sourceRoot, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) return { version: FALLBACK_VERSION };
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      version?: string;
      hooks?: unknown;
    };
    return { version: parsed.version ?? FALLBACK_VERSION, hooks: parsed.hooks };
  } catch {
    return { version: FALLBACK_VERSION };
  }
}

export async function install(args: readonly string[]): Promise<void> {
  const opts = parseArgs(args);

  if (!opts.global) {
    console.error(`void-harness install requires --global.`);
    console.error(``);
    console.error(`The default install is per-project. Run:`);
    console.error(`  void-harness init`);
    console.error(``);
    console.error(`If you really want a global install (rare), run:`);
    console.error(`  void-harness install --global`);
    process.exit(2);
  }

  const sourceRoot = await findCoreSource();
  if (!existsSync(sourceRoot)) {
    throw new Error(`source not found: ${sourceRoot} (is the npm package installed?)`);
  }

  const pluginRoot = join(homedir(), '.claude', 'plugins', PLUGIN_NAME);

  console.log(`void-harness install --global`);
  console.log(`  source : ${sourceRoot}`);
  console.log(`  plugin : ${pluginRoot}`);
  if (opts.dryRun) console.log(`  mode   : dry-run (no changes)`);

  if (!opts.dryRun) {
    await rm(pluginRoot, { recursive: true, force: true });
    await mkdir(pluginRoot, { recursive: true });

    const skillsSrc = join(sourceRoot, 'skills');
    const agentsSrc = join(sourceRoot, 'agents');
    const hooksSrc = join(sourceRoot, 'hooks');
    const modulesSrc = join(sourceRoot, 'modules');

    if (existsSync(skillsSrc)) await cp(skillsSrc, join(pluginRoot, 'skills'), { recursive: true });
    if (existsSync(agentsSrc)) await cp(agentsSrc, join(pluginRoot, 'agents'), { recursive: true });
    if (existsSync(hooksSrc)) await cp(hooksSrc, join(pluginRoot, 'hooks'), { recursive: true });
    if (existsSync(modulesSrc)) await cp(modulesSrc, join(pluginRoot, 'modules'), { recursive: true });

    const core = await readCoreManifest(sourceRoot);
    await writeManifest(pluginRoot, core);
  }

  console.log(`done.`);
  console.log(``);
  console.log(`Note: per-project layout is still preferred. Use 'void-harness init' in any project where you want isolation, pinning, or team sharing.`);
}

async function writeManifest(pluginRoot: string, core: CoreManifest): Promise<void> {
  const manifestDir = join(pluginRoot, '.claude-plugin');
  const manifestPath = join(manifestDir, 'plugin.json');
  await mkdir(manifestDir, { recursive: true });

  // Mirror the source manifest's hook wiring verbatim. The source hook commands
  // already use ${CLAUDE_PLUGIN_ROOT}, which resolves under the global plugin
  // root, so no rewriting is needed and the global install can never lag behind
  // the committed plugin.json.
  const manifest = {
    name: PLUGIN_NAME,
    version: core.version,
    description: 'VoidCorp craftsman harness — opinionated skills, agents, and hooks for Claude Code projects.',
    author: { name: 'VoidCorp', email: 'florent.pellegrin@voidcorp.io' },
    homepage: 'https://github.com/voidcorp-core/void-harness',
    license: 'MIT',
    keywords: ['voidcorp', 'craftsman', 'tdd', 'tigerstyle', 'harness'],
    ...(core.hooks !== undefined ? { hooks: core.hooks } : {}),
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
