// `void-harness doctor` — health-check the project's harness setup.
//
// Verifies:
//   1. .void/config.json valid JSON
//   2. .void/PHILOSOPHY.md + .void/PROJECT-DOCTRINE.md present
//   3. .claude/settings.json has extraKnownMarketplaces.void-harness + at
//      least void@void-harness in enabledPlugins
//   4. CLAUDE.md contains the void-harness block
//   5. jq is available (required by the PreToolUse + pre-commit hooks, which
//      parse the Claude Code tool-call JSON from stdin) — always checked
//   6. gh CLI is available and authenticated (required for the private repo
//      marketplace fetch) — only when remote checks run; --no-remote skips it

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, PACKS, enabledPluginsKey } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import { fetchRemoteMarketplace } from '../lib/remote.js';
import { compareVersions, normalizeVersion } from '../lib/version.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly message: string;
  readonly fix?: string;
}

const BEGIN_MARKER = '<!-- void-harness:begin -->';

export async function doctor(args: readonly string[]): Promise<void> {
  const skipRemote = args.includes('--no-remote');
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

async function checkRemoteVersions(root: string): Promise<CheckResult> {
  const settings = await readSettings(settingsPathFor(root));
  const entry = (settings.extraKnownMarketplaces as Record<string, unknown> | undefined)?.[MARKETPLACE_NAME];
  const repo =
    (entry && typeof entry === 'object' ? (entry as { source?: { repo?: string } }).source?.repo : undefined) ??
    'voidcorp-core/void-harness';

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
    if (compareVersions(normalizeVersion(declared), plugin.version) < 0) {
      drifted.push(`${plugin.name} ${normalizeVersion(declared)} → ${plugin.version}`);
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

function checkJq(): CheckResult {
  // Every PreToolUse hook (tdd-guard, no-any, boundary-direction-check, ...)
  // parses the Claude Code tool-call JSON from stdin with jq. Without it the
  // hooks fail open and silently stop enforcing anything.
  try {
    execSync('jq --version', { stdio: 'ignore' });
    return { name: 'jq', ok: true, message: 'available (required by hooks)' };
  } catch {
    return {
      name: 'jq',
      ok: false,
      message: 'jq not installed: enforcement hooks will not run',
      fix: 'brew install jq OR https://jqlang.github.io/jq/download/',
    };
  }
}
