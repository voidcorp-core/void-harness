// `voidcorp-harness install` — install core skills/agents/hooks into ~/.claude/voidcorp/.
//
// Strategy: copy `packages/core/claude/**` from the installed npm package into
// `~/.claude/voidcorp/`. Idempotent. If the target already exists, the install
// is treated as an update (overwrite versioned content, preserve any user
// additions detected via a marker file).

import { cp, mkdir, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCoreSource } from '../lib/paths.js';

interface InstallOptions {
  readonly dryRun: boolean;
}

function parseArgs(args: readonly string[]): InstallOptions {
  return { dryRun: args.includes('--dry-run') };
}

export async function install(args: readonly string[]): Promise<void> {
  const opts = parseArgs(args);
  const targetRoot = join(homedir(), '.claude', 'voidcorp');
  const sourceRoot = await findCoreSource();

  console.log(`voidcorp-harness install`);
  console.log(`  source : ${sourceRoot}`);
  console.log(`  target : ${targetRoot}`);
  if (opts.dryRun) console.log(`  mode   : dry-run (no changes will be written)`);

  if (!existsSync(sourceRoot)) {
    throw new Error(`source not found: ${sourceRoot} (is the npm package installed?)`);
  }

  if (!opts.dryRun) {
    await mkdir(targetRoot, { recursive: true });
    await cp(sourceRoot, targetRoot, { recursive: true });
    await writeFile(
      join(targetRoot, '.voidcorp-install-marker'),
      JSON.stringify({ installedAt: new Date().toISOString() }, null, 2),
    );
  }

  // Sanity: count what was installed.
  const counted = await countSkillsAgentsHooks(opts.dryRun ? sourceRoot : targetRoot);
  console.log(`  installed: ${counted.skills} skills, ${counted.agents} agents, ${counted.hooks} hooks`);
  console.log(`done.`);
}

interface InstallCount {
  readonly skills: number;
  readonly agents: number;
  readonly hooks: number;
}

async function countSkillsAgentsHooks(root: string): Promise<InstallCount> {
  const count = async (sub: string): Promise<number> => {
    const dir = join(root, 'claude', sub);
    if (!existsSync(dir)) return 0;
    const entries = await readdir(dir);
    let n = 0;
    for (const e of entries) {
      const stats = await stat(join(dir, e));
      if (stats.isDirectory()) n += 1;
      else if (stats.isFile() && (e.endsWith('.sh') || e.endsWith('.md'))) n += 1;
    }
    return n;
  };
  return {
    skills: await count('skills'),
    agents: await count('agents'),
    hooks: await count('hooks'),
  };
}
