// `void-harness doctor` — health-check the project's harness setup.
//
// Verifies:
//   1. .void/config.json valid JSON
//   2. .void/PHILOSOPHY.md + .void/PROJECT-DOCTRINE.md present
//   3. .claude/settings.json has extraKnownMarketplaces.void-harness + at
//      least harness@voidcorp in enabledPlugins
//   4. CLAUDE.md contains the void-harness block
//   5. jq is available (required by the PreToolUse + pre-commit hooks, which
//      parse the Claude Code tool-call JSON from stdin) — always checked
//   6. gh CLI is available and authenticated (required for the private repo
//      marketplace fetch) — only when remote checks run; --no-remote skips it

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, MARKETPLACE_REPO, PACKS, enabledPluginsKey } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import { fetchPinnedPluginVersion, fetchRemoteMarketplace } from '../lib/remote.js';
import { checkGh, checkJq, type CheckResult } from '../lib/prerequisites.js';
import { packsCoherenceIssues, validateConfig } from '../lib/config-schema.js';
import { hookHealthIssues, locatePluginDir } from '../lib/plugin-cache.js';
import { compareVersions, normalizeVersion } from '../lib/version.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import { homedir } from 'node:os';

const BEGIN_MARKER = '<!-- void-harness:begin -->';

/** Plain pack names (no @voidcorp/ prefix, core excluded) pinned in config.packs. */
function configPackNames(config: { packs?: Record<string, string> }): string[] {
  return Object.keys(config.packs ?? {})
    .map((k) => k.replace(/^@voidcorp\//, ''))
    .filter((name) => name !== CORE_PLUGIN_NAME);
}

/** Plain pack names enabled (=== true) in settings.enabledPlugins, core excluded. */
function enabledPackNames(plugins: Record<string, unknown>): string[] {
  return Object.keys(plugins)
    .filter((k) => plugins[k] === true)
    .map((k) => k.split('@')[0] ?? '')
    .filter((name) => name.length > 0 && name !== CORE_PLUGIN_NAME);
}

export async function doctor(args: readonly string[]): Promise<void> {
  const skipRemote = args.includes('--no-remote');
  const checks: CheckResult[] = [];
  const root = process.cwd();

  // Parsed config is reused by the schema check AND the settings<->config
  // coherence check further down, so capture it once here.
  let parsedConfig: { packs?: Record<string, string> } & Record<string, unknown> = {};
  let configReadable = false;

  const configPath = join(root, '.void', 'config.json');
  if (!existsSync(configPath)) {
    checks.push({ name: 'project config', ok: false, message: '.void/config.json missing', fix: 'void-harness init' });
  } else {
    try {
      parsedConfig = JSON.parse(await readFile(configPath, 'utf8'));
      configReadable = true;
      // Shape validation, not just parseability: a mistyped path / non-semver
      // pin passes JSON.parse but breaks a hook later, so report it with its
      // JSON path (#68).
      const validation = validateConfig(parsedConfig);
      if (validation.ok) {
        checks.push({ name: 'project config', ok: true, message: 'valid JSON + schema' });
      } else {
        checks.push({
          name: 'project config',
          ok: false,
          message: `schema errors: ${validation.issues.join('; ')}`,
          fix: 'fix the fields above in .void/config.json',
        });
      }
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
  let enabledPlugins: Record<string, unknown> = {};
  let settingsReadable = false;
  if (!existsSync(settingsPath)) {
    checks.push({ name: 'settings.json', ok: false, message: '.claude/settings.json missing', fix: 'void-harness init' });
  } else {
    const settings = await readSettings(settingsPath);
    const markets = (settings.extraKnownMarketplaces ?? {}) as Record<string, unknown>;
    enabledPlugins = (settings.enabledPlugins ?? {}) as Record<string, unknown>;
    settingsReadable = true;
    const hasMarketplace = markets[MARKETPLACE_NAME] !== undefined;
    const hasCore = enabledPlugins[enabledPluginsKey(CORE_PLUGIN_NAME)] === true;
    if (hasMarketplace && hasCore) {
      const activePlugins = Object.keys(enabledPlugins).filter((k) => enabledPlugins[k] === true).length;
      checks.push({ name: 'settings.json', ok: true, message: `marketplace registered, ${activePlugins} plugin(s) enabled` });
    } else {
      const missing = [
        !hasMarketplace && `extraKnownMarketplaces.${MARKETPLACE_NAME}`,
        !hasCore && `enabledPlugins["${enabledPluginsKey(CORE_PLUGIN_NAME)}"]`,
      ].filter(Boolean).join(', ');
      checks.push({ name: 'settings.json', ok: false, message: `missing: ${missing}`, fix: 'void-harness init' });
    }
  }

  // Coherence: a pack enabled in settings.json but not pinned in config (or the
  // reverse) means the plugin loads but is unpinned, or is pinned but never
  // loads. Only meaningful when both files were readable (#68).
  if (configReadable && settingsReadable) {
    const issues = packsCoherenceIssues(enabledPackNames(enabledPlugins), configPackNames(parsedConfig));
    if (issues.length === 0) {
      checks.push({ name: 'packs coherence', ok: true, message: 'settings.json ⇄ .void/config.json in sync' });
    } else {
      checks.push({
        name: 'packs coherence',
        ok: false,
        message: issues.join('; '),
        fix: 'void-harness add/remove <pack> to realign, or edit .void/config.json',
      });
    }
  }

  // CLAUDE.md (Claude Code) and AGENTS.md (Codex) are sister docs that init /
  // add / remove keep in parity; verify both carry the harness block.
  for (const doc of ['CLAUDE.md', 'AGENTS.md']) {
    const docPath = join(root, doc);
    if (!existsSync(docPath)) {
      checks.push({ name: doc, ok: false, message: 'missing', fix: 'void-harness init' });
      continue;
    }
    const text = await readFile(docPath, 'utf8');
    if (text.includes(BEGIN_MARKER)) {
      checks.push({ name: doc, ok: true, message: 'void-harness block present' });
    } else {
      checks.push({ name: doc, ok: false, message: 'void-harness block missing', fix: 'void-harness init' });
    }
  }

  // jq is needed by the local enforcement hooks, so it is always checked.
  // gh only matters for fetching the private marketplace, so it is gated
  // behind the remote checks: --no-remote is a fully offline run.
  checks.push(checkJq());

  // Plugin cache hooks: the enforcement layer is only real if the hooks the
  // installed plugin.json wires exist and are executable in the cache. Absent
  // cache = not installed yet (informational, ≠ corruption).
  checks.push(await checkPluginCacheHooks());

  if (!skipRemote) {
    checks.push(checkGh());
    checks.push(await checkRemoteVersions(root));
  }

  banner('doctor');
  blank();
  for (const check of checks) {
    const markFn = check.ok ? c.green(glyph.check) : c.red('x');
    line(`${markFn}  ${c.dim(check.name.padEnd(18))}${check.message}`);
    if (!check.ok && check.fix) line(c.dim(`     ${glyph.to} ${check.fix}`));
  }

  const blockers = checks.filter((ck) => !ck.ok).length;
  if (blockers === 0) {
    footer(c.dim('all checks passed'));
  } else {
    footer(c.red(`${blockers} check${blockers > 1 ? 's' : ''} failed`));
    process.exit(1);
  }
}

async function checkPluginCacheHooks(): Promise<CheckResult> {
  // Claude Code caches marketplace plugins under ~/.claude/plugins/cache.
  const cacheRoot = join(homedir(), '.claude', 'plugins', 'cache');
  const pluginDir = locatePluginDir(cacheRoot, CORE_PLUGIN_NAME);
  if (!pluginDir) {
    return {
      name: 'plugin cache',
      ok: true,
      message: 'not installed in cache yet (restart Claude Code to fetch it)',
    };
  }
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    return { name: 'plugin cache', ok: false, message: `unreadable manifest: ${(err as Error).message}` };
  }
  const issues = hookHealthIssues(pluginDir, manifest);
  if (issues.length === 0) {
    return { name: 'plugin cache', ok: true, message: 'wired hooks present + executable' };
  }
  return {
    name: 'plugin cache',
    ok: false,
    message: issues.join('; '),
    fix: '/plugin marketplace update (inside Claude Code) to refetch the plugin',
  };
}

async function checkRemoteVersions(root: string): Promise<CheckResult> {
  const settings = await readSettings(settingsPathFor(root));
  const entry = (settings.extraKnownMarketplaces as Record<string, unknown> | undefined)?.[MARKETPLACE_NAME];
  const repo =
    (entry && typeof entry === 'object' ? (entry as { source?: { repo?: string } }).source?.repo : undefined) ??
    MARKETPLACE_REPO;

  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) {
    return {
      name: 'remote versions',
      ok: true,
      message: `skipped (could not fetch ${repo}: ${remote.error})`,
    };
  }

  const configPath = join(root, '.void', 'config.json');
  if (!existsSync(configPath)) {
    return { name: 'remote versions', ok: true, message: 'skipped (no .void/config.json)' };
  }
  let local: { core?: string; packs?: Record<string, string> } = {};
  try {
    local = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    return { name: 'remote versions', ok: true, message: 'skipped (invalid .void/config.json)' };
  }

  const localFor = (name: string): string | undefined =>
    name === CORE_PLUGIN_NAME
      ? local.core
      : PACKS.some((p) => p.name === name)
        ? local.packs?.[`@voidcorp/${name}`]
        : undefined;

  const drifted: string[] = [];
  for (const plugin of remote.value.plugins) {
    const declared = localFor(plugin.name);
    if (!declared) continue;
    const pinned = fetchPinnedPluginVersion(plugin);
    if (!pinned.ok) continue;
    if (compareVersions(normalizeVersion(declared), pinned.value) < 0) {
      drifted.push(`${plugin.name} ${normalizeVersion(declared)} → ${pinned.value}`);
    }
  }

  if (drifted.length === 0) {
    return { name: 'remote versions', ok: true, message: 'all plugins at remote HEAD' };
  }
  // Summarize when many plugins drift (common after a lockstep bump); detailed
  // enumeration belongs in `check`, not doctor.
  if (drifted.length > 2) {
    return {
      name: 'remote versions',
      ok: true,
      message: `${drifted.length} plugins behind — run \`void-harness check\` for details`,
      fix: '/plugin marketplace update (inside Claude Code)',
    };
  }
  return {
    name: 'remote versions',
    ok: true,
    message: `update available: ${drifted.join(', ')}`,
    fix: '/plugin marketplace update (inside Claude Code)',
  };
}

