// `void-harness install --global` — install the void harness as a
// Claude Code plugin at the user-global level: ~/.claude-plugin/plugins/void/.
//
// This is the ESCAPE HATCH. The recommended flow is `void-harness init`
// which installs the same plugin locally inside <cwd>/.claude/plugins/.

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

// See packages/cli/src/commands/init.ts for the rationale on `void`.
const PLUGIN_NAME = 'void';
const FALLBACK_VERSION = '0.0.0';

/**
 * Read the canonical version from the bundled core plugin manifest. Falls
 * back to FALLBACK_VERSION if missing — the marketplace.json version is
 * the source of truth; this just mirrors it for the global install.
 */
async function readCoreVersion(sourceRoot: string): Promise<string> {
  const manifestPath = join(sourceRoot, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) return FALLBACK_VERSION;
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
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

    const version = await readCoreVersion(sourceRoot);
    await writeManifest(pluginRoot, version);
  }

  console.log(`done.`);
  console.log(``);
  console.log(`Note: per-project layout is still preferred. Use 'void-harness init' in any project where you want isolation, pinning, or team sharing.`);
}

async function writeManifest(pluginRoot: string, version: string): Promise<void> {
  const manifestDir = join(pluginRoot, '.claude-plugin');
  const manifestPath = join(manifestDir, 'plugin.json');
  await mkdir(manifestDir, { recursive: true });

  const hooksDir = join(pluginRoot, 'hooks');
  const hookFiles = existsSync(hooksDir)
    ? (await readdir(hooksDir)).filter((f) => f.endsWith('.sh'))
    : [];

  const hookWiring: Record<string, { event: string; matcher?: string }> = {
    'tdd-guard.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'tsc-noemit-precommit.sh': { event: 'PreToolUse', matcher: 'Bash' },
    'no-any-grep.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'no-as-cast-grep.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'no-only-no-skip.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'no-null-grep.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'no-console-log-grep.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'boundary-direction-check.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
    'test-name-lint.sh': { event: 'PreToolUse', matcher: 'Edit|Write' },
  };

  const eventBuckets: Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string }> }>> = {};
  for (const file of hookFiles) {
    const wiring = hookWiring[file];
    if (!wiring) continue;
    let bucket = eventBuckets[wiring.event];
    if (!bucket) {
      bucket = [];
      eventBuckets[wiring.event] = bucket;
    }
    bucket.push({
      ...(wiring.matcher !== undefined ? { matcher: wiring.matcher } : {}),
      hooks: [{ type: 'command', command: `\${CLAUDE_PLUGIN_ROOT}/hooks/${file}` }],
    });
  }

  const manifest = {
    name: PLUGIN_NAME,
    version,
    description: 'VoidCorp craftsman harness — opinionated skills, agents, and hooks for Claude Code projects.',
    author: { name: 'VoidCorp', email: 'florent.pellegrin@voidcorp.io' },
    homepage: 'https://github.com/voidcorp-core/void-harness',
    license: 'MIT',
    keywords: ['void', 'craftsman', 'tdd', 'tigerstyle', 'harness'],
    ...(Object.keys(eventBuckets).length > 0 ? { hooks: eventBuckets } : {}),
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
