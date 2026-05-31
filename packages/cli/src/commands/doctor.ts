// `void-harness doctor` — health-check the project's harness setup.
//
// Verifies:
//   1. .void/config.json valid JSON
//   2. .void/PHILOSOPHY.md + .void/PROJECT-DOCTRINE.md present
//   3. .claude/settings.json has extraKnownMarketplaces.void-harness + at
//      least void@void-harness in enabledPlugins
//   4. CLAUDE.md contains the void-harness block
//   5. gh CLI is available and authenticated (required for private repo
//      marketplace fetch)

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, enabledPluginsKey } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly message: string;
  readonly fix?: string;
}

const BEGIN_MARKER = '<!-- void-harness:begin -->';

export async function doctor(_args: readonly string[]): Promise<void> {
  const checks: CheckResult[] = [];
  const root = process.cwd();

  const configPath = join(root, '.void', 'config.json');
  if (!existsSync(configPath)) {
    checks.push({ name: 'project config', ok: false, message: '.void/config.json missing', fix: 'void-harness init' });
  } else {
    try {
      JSON.parse(await readFile(configPath, 'utf8'));
      checks.push({ name: 'project config', ok: true, message: 'valid JSON' });
    } catch (err) {
      checks.push({ name: 'project config', ok: false, message: `invalid JSON: ${(err as Error).message}` });
    }
  }

  const philosophyPath = join(root, '.void', 'PHILOSOPHY.md');
  const doctrinePath = join(root, '.void', 'PROJECT-DOCTRINE.md');
  const havePhilo = existsSync(philosophyPath);
  const haveDoctrine = existsSync(doctrinePath);
  if (havePhilo && haveDoctrine) {
    checks.push({ name: 'doctrine files', ok: true, message: 'PHILOSOPHY.md + PROJECT-DOCTRINE.md present' });
  } else {
    const missing = [!havePhilo && 'PHILOSOPHY.md', !haveDoctrine && 'PROJECT-DOCTRINE.md'].filter(Boolean).join(', ');
    checks.push({ name: 'doctrine files', ok: false, message: `missing: ${missing}`, fix: 'void-harness init' });
  }

  const settingsPath = settingsPathFor(root);
  if (!existsSync(settingsPath)) {
    checks.push({ name: 'settings.json', ok: false, message: '.claude/settings.json missing', fix: 'void-harness init' });
  } else {
    const settings = await readSettings(settingsPath);
    const markets = (settings.extraKnownMarketplaces ?? {}) as Record<string, unknown>;
    const plugins = (settings.enabledPlugins ?? {}) as Record<string, unknown>;
    const hasMarketplace = markets[MARKETPLACE_NAME] !== undefined;
    const hasCore = plugins[enabledPluginsKey(CORE_PLUGIN_NAME)] === true;
    if (hasMarketplace && hasCore) {
      const activePlugins = Object.keys(plugins).filter((k) => plugins[k] === true).length;
      checks.push({ name: 'settings.json', ok: true, message: `marketplace registered, ${activePlugins} plugin(s) enabled` });
    } else {
      const missing = [
        !hasMarketplace && `extraKnownMarketplaces.${MARKETPLACE_NAME}`,
        !hasCore && `enabledPlugins["${enabledPluginsKey(CORE_PLUGIN_NAME)}"]`,
      ].filter(Boolean).join(', ');
      checks.push({ name: 'settings.json', ok: false, message: `missing: ${missing}`, fix: 'void-harness init' });
    }
  }

  const claudeMd = join(root, 'CLAUDE.md');
  if (!existsSync(claudeMd)) {
    checks.push({ name: 'CLAUDE.md', ok: false, message: 'missing', fix: 'void-harness init' });
  } else {
    const text = await readFile(claudeMd, 'utf8');
    if (text.includes(BEGIN_MARKER)) {
      checks.push({ name: 'CLAUDE.md', ok: true, message: 'void-harness block present' });
    } else {
      checks.push({ name: 'CLAUDE.md', ok: false, message: 'void-harness block missing', fix: 'void-harness init' });
    }
  }

  checks.push(checkGh());

  console.log(`void-harness doctor\n`);
  for (const c of checks) {
    const mark = c.ok ? '✓' : '✗';
    console.log(`  ${mark} ${c.name.padEnd(20)} ${c.message}`);
    if (!c.ok && c.fix) console.log(`    → fix: ${c.fix}`);
  }

  const blockers = checks.filter((c) => !c.ok).length;
  console.log(``);
  if (blockers === 0) {
    console.log(`all checks passed.`);
    console.log(`Restart Claude Code if needed. Skills appear as /void:<name> and /void-<stack>:<name>.`);
  } else {
    console.log(`${blockers} check(s) failed.`);
    process.exit(1);
  }
}

function checkGh(): CheckResult {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    return {
      name: 'gh CLI',
      ok: false,
      message: 'gh CLI not installed (required for private marketplace)',
      fix: 'brew install gh OR https://cli.github.com',
    };
  }
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return { name: 'gh CLI', ok: true, message: 'authenticated' };
  } catch {
    return {
      name: 'gh CLI',
      ok: false,
      message: 'gh CLI not authenticated (required for private marketplace)',
      fix: 'gh auth login',
    };
  }
}
