// `void-harness doctor` — health-check the project's harness setup.
//
// Verifies:
//   1. .void/config.json valid JSON
//   2. .void/PHILOSOPHY.md + .void/PROJECT-DOCTRINE.md present
//   3. .claude/settings.json has extraKnownMarketplaces.void-harness + at
//      least harness@voidcorp in enabledPlugins
//   4. CLAUDE.md contains the void-harness block
//   5. gh CLI is available and authenticated (required for the optional
//      marketplace fetch) — only when remote checks run; --no-remote skips it

import { execFileSync } from 'node:child_process';
import { isLocalEntry, pendingMigrations, VOID_LOCAL_DIR } from '@voidcorp/hook-runner';
import { judgeLayout, type LayoutObservation } from '../lib/void-hygiene.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readActiveProgram } from '../lib/autopilot/active-program.js';
import { autopilotPreflight } from '../lib/autopilot/preflight.js';
import { packsCoherenceIssues, validateConfig } from '../lib/config-schema.js';
import { CORE_PLUGIN_NAME, MARKETPLACE_REPO, PACKS, packDirForName } from '../lib/packs.js';
import { inspectHarnessLintExclusion } from '../lib/lint-exclusion.js';
import { findCoreSource } from '../lib/paths.js';
import { type CheckResult, checkEnforceWorkflow, checkGh } from '../lib/prerequisites.js';
import { readInstallReceipt } from '../lib/receipts.js';
import { publishedVersionCheck } from '../lib/freshness-check.js';
import { checkGlyph, checkShowsFix } from '../lib/doctor-render.js';
import { resolveFreshness } from '@voidcorp/hook-runner';
import { fetchPinnedPluginVersion, fetchRemoteMarketplace } from '../lib/remote.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import { detectedAdapters } from '../lib/runtime-adapters.js';
import { localPackAssetIssues } from '../lib/runtime-assets.js';
import { selfRepoDoctorTarget } from '../lib/self-repo.js';
import { runSelfHostDoctor } from './self-host.js';
import { marketplaceRepoFrom, readSettings, settingsPathFor } from '../lib/settings.js';
import { compareVersions, normalizeVersion } from '../lib/version.js';

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

  const target = selfRepoDoctorTarget(root);
  if (target.kind === 'self-host') {
    await runSelfHostDoctor(root, args);
    return;
  }

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
        checks.push({
          name: 'project config',
          ok: true,
          message: validation.warnings.length === 0
            ? 'valid JSON + schema'
            : `valid with migration warning: ${validation.warnings.join('; ')}`,
        });
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

  // Runtime-specific health: each DETECTED runtime's adapter verifies its own
  // wiring + doctrine doc. Docs are per-runtime now, so a Codex-only project is
  // never dinged for a missing CLAUDE.md, and vice versa. The command never
  // branches on a runtime name — it iterates the detected adapters.
  const detected = detectedAdapters(root);
  const claudeDetected = detected.some((a) => a.id === 'claude');
  const receipt = await readInstallReceipt(root);
  const marketplaceInstall = receipt?.source === 'marketplace';
  if (detected.length === 0) {
    // No footprint at all ⇒ nothing is wired. Without this, a project that has
    // .void/config.json but no CLAUDE.md/.claude or AGENTS.md/.codex would run
    // zero wiring checks and falsely report "all checks passed".
    checks.push({
      name: 'runtimes',
      ok: false,
      message: 'no agent runtime wired (no CLAUDE.md/.claude or AGENTS.md/.codex)',
      fix: 'void-harness init, or void-harness runtime add <claude|codex>',
    });
  }
  for (const adapter of detected) {
    const inspection = await adapter.inspect(root);
    checks.push(...inspection.checks);
    const show = (value: boolean | null): string =>
      value === null ? 'unknown' : value ? 'yes' : 'no';
    const lifecycleUnknown = Object.values(inspection.evidence)
      .some((value) => value === null);
    checks.push({
      name: `${adapter.id} lifecycle`,
      ok: inspection.evidence.fired === true,
      ...(lifecycleUnknown ? { status: 'unknown' as const } : {}),
      message: [
        `installed=${show(inspection.evidence.installed)}`,
        `wired=${show(inspection.evidence.wired)}`,
        `fired=${show(inspection.evidence.fired)}`,
        `observed=${show(inspection.evidence.observed)}`,
      ].join(' '),
      ...(inspection.evidence.fired === true
        ? {}
        : { fix: `void-harness runtime add ${adapter.id}` }),
    });
  }

  // Coherence: a pack enabled in settings.json but not pinned in config (or the
  // reverse). Claude-marketplace concern — only when Claude is wired and both
  // files are readable (#68).
  if (configReadable && receipt?.source === 'local') {
    const packNames = configPackNames(parsedConfig);
    const packDirectories = packNames
      .map(packDirForName)
      .filter((directory): directory is string => directory !== undefined);
    let issues: string[];
    try {
      issues = await localPackAssetIssues(
        root,
        await findCoreSource(),
        packDirectories,
        detected.map((adapter) => adapter.id),
      );
    } catch (error) {
      issues = [`could not inspect bundled pack assets: ${(error as Error).message}`];
    }
    checks.push(issues.length === 0
      ? { name: 'packs coherence', ok: true, message: 'local pack assets match .void/config.json' }
      : {
          name: 'packs coherence',
          ok: false,
          message: issues.join('; '),
          fix: 'void-harness init to reconcile local pack assets',
        });
  } else if (claudeDetected && configReadable && existsSync(settingsPathFor(root))) {
    const settings = await readSettings(settingsPathFor(root));
    const issues = packsCoherenceIssues(enabledPackNames(settings.enabledPlugins ?? {}), configPackNames(parsedConfig));
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

  // The harness writes engine-format files into `.claude/`. Left inside the
  // project's lint glob they fail on code the project does not own and cannot
  // fix, which is the harness charging its own cost to its consumer.
  if (claudeDetected) {
    const lint = await inspectHarnessLintExclusion(root);
    checks.push(
      lint.kind === 'excluded'
        ? { name: 'lint boundary', ok: true, message: `${lint.file}: .claude excluded from project lint` }
        : lint.kind === 'no-linter'
          ? { name: 'lint boundary', ok: true, message: 'no linter config found, nothing to exclude' }
          : {
              name: 'lint boundary',
              ok: true,
              status: 'advisory' as const,
              message: `${lint.file} lints .claude as project source; harness files are written in engine formats a JS parser rejects`,
              fix: lint.instruction,
            },
    );
  }

  // Advisory: is the same floor also enforced server-side (void-enforce
  // Action)? Never a blocker (ok stays true).
  checks.push(checkEnforceWorkflow(root));

  // Plugin cache + remote version checks are Claude-marketplace concerns — only
  // relevant when Claude is wired. gh gates the private-marketplace fetch, so it
  // rides with the remote checks (--no-remote is a fully offline run).
  if (claudeDetected && marketplaceInstall) {
    if (!skipRemote) {
      checks.push(checkGh());
      checks.push(await checkRemoteVersions(root));
    }
  }

  // Registry freshness is a concern of the PRIMARY npm channel, so unlike the
  // marketplace checks above it is not gated on Claude being wired. --no-remote
  // still skips it: that flag promises a fully offline run.
  if (!skipRemote) {
    checks.push(await checkPublishedVersion(root));
  }

  // Layout hygiene: does this project actually keep observed state out of its
  // history? Proven with git, not inferred from the ignore file being present.
  checks.push(...judgeLayout(observeLayout(root)));

  // Autopilot's preconditions, but only for a project that declares a program:
  // adding seven checks to every other project would be noise about a feature
  // they do not use. Non-mutating throughout — doctor must stay safe to run
  // while a cluster is in flight, so nothing here touches a tracker, a remote
  // or a git ref, and what it cannot read reports as unknown rather than false.
  if (existsSync(join(root, 'plans', 'ACTIVE.md'))) {
    checks.push(...autopilotPreflight(observeAutopilot(root)));
  }

  banner('doctor');
  blank();
  for (const check of checks) {
    const marks: Record<ReturnType<typeof checkGlyph>, string> = {
      unknown: c.yellow('?'),
      // Dim and distinct from `?`: nothing here asks anything of the reader.
      unprobed: c.dim('-'),
      advisory: c.yellow('!'),
      pass: c.green(glyph.check),
      fail: c.red('x'),
    };
    // A separator of its own: padding alone collapses for any name at or over
    // the width, which is how `autopilot worktrees` printed as
    // `worktreesworktrees usable`.
    line(`${marks[checkGlyph(check)]}  ${c.dim(check.name.padEnd(18))} ${check.message}`);
    if (checkShowsFix(check) && check.fix) line(c.dim(`     ${glyph.to} ${check.fix}`));
  }

  // Unknown is not failure. A check that could not reach a tracker has not
  // found a defect, and counting it as one made `doctor` report `4 checks
  // failed` where two things were broken and two were unmeasured — the same
  // conflation this repo refuses everywhere else.
  const unknown = checks.filter((check) => check.status === 'unknown').length;
  const unprobed = checks.filter((check) => check.status === 'unprobed').length;
  const advisory = checks.filter((check) => check.status === 'advisory').length;
  const blockers = checks.filter(
    (check) => !check.ok && check.status !== 'unknown' && check.status !== 'unprobed',
  ).length;
  const notes = [
    unknown > 0 ? `${unknown} unknown` : undefined,
    // Named apart in the summary too, so "2 not probed" never reads as two
    // things left to investigate (#193).
    unprobed > 0 ? `${unprobed} not probed (proven by autopilot at preflight)` : undefined,
    advisory > 0 ? `${advisory} advisory` : undefined,
  ].filter((note): note is string => note !== undefined);
  if (blockers === 0) {
    // Never "all checks passed" while a line above says otherwise: a summary
    // that contradicts its own body teaches people to skip the summary.
    footer(notes.length === 0
      ? c.dim('all checks passed')
      : c.yellow(`no blocker; ${notes.join(', ')}`));
  } else {
    footer(c.red([`${blockers} check${blockers > 1 ? 's' : ''} failed`, ...notes].join(', ')));
    process.exit(1);
  }
}

/** Compare the installed harness against the version published on the npm registry. */
async function checkPublishedVersion(root: string): Promise<CheckResult> {
  const receipt = await readInstallReceipt(root);
  const installed = receipt?.version ?? 'unknown';
  const freshness = await resolveFreshness({ installed, env: process.env, now: Date.now() });
  return publishedVersionCheck(freshness, receipt?.source);
}

async function checkRemoteVersions(root: string): Promise<CheckResult> {
  const settings = await readSettings(settingsPathFor(root));
  const repo = marketplaceRepoFrom(settings, MARKETPLACE_REPO);

  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) {
    return {
      name: 'remote versions',
      ok: true,
      status: 'unknown',
      message: `unknown (could not fetch ${repo}: ${remote.error})`,
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
    const pinned = fetchPinnedPluginVersion(plugin, repo);
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


/**
 * Ask git what it actually does with observed state, rather than trusting that
 * the ignore block is present: a rule can be absent, overridden by a later rule,
 * or powerless because the path was tracked before the rule existed.
 *
 * Read-only — `check-ignore` and `ls-files` mutate nothing — and every failure to
 * ask resolves to "could not determine", never to a false clean bill.
 */
function observeLayout(root: string): LayoutObservation {
  const git = (args: readonly string[]): string | null => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };

  const insideRepo = git(['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
  if (!insideRepo) {
    return { pending: pendingMigrations(root), localIgnored: null, trackedObserved: [] };
  }

  // `check-ignore` exits non-zero when the path is NOT ignored, which the helper
  // turns into null; here that is a real answer, not an unknown.
  const probe = join('.void', 'local', '.probe');
  const localIgnored = git(['check-ignore', '-q', probe]) !== null;

  // Both halves: the migrated location and anything observed still tracked at the
  // old one. A project mid-migration leaks through the second.
  const listed = git(['ls-files', '-z', '--', '.void']) ?? '';
  const tracked = listed.split('\0').filter((path) => path !== '');
  const trackedObserved = tracked.filter((path) => {
    const relative = path.startsWith('.void/') ? path.slice('.void/'.length) : path;
    if (relative.startsWith(`${VOID_LOCAL_DIR}/`)) return true;
    return isLocalEntry(relative.split('/')[0] ?? '');
  });

  return { pending: pendingMigrations(root), localIgnored, trackedObserved };
}

/**
 * Observe autopilot's preconditions without touching anything.
 *
 * The two remote-backed facts — is the tracker reachable, is the base protected
 * — are deliberately left unprobed. Probing them here would make `doctor` depend
 * on a network and a token, and `--no-remote` promises a fully offline run.
 * Autopilot itself proves both at preflight, before it claims; this reports what
 * can be read from disk.
 *
 * They report as `unprobed`, not `unknown`, so the reason reaches the reader:
 * `unknown` earned a "reconfigure and run it again" fix that no configuration
 * could ever satisfy here, and operators paid for the detour (#193).
 */
function observeAutopilot(root: string): Parameters<typeof autopilotPreflight>[0] {
  let program: ReturnType<typeof readActiveProgram> | null = null;
  let malformed: { problem: string; fix: string } | null = null;
  try {
    program = readActiveProgram(root) ?? null;
  } catch (error) {
    // A malformed ACTIVE is reported by the check below as a failure of the
    // program, not as a crash of doctor — and as malformed, not as absent.
    // Collapsing both into null printed "no plans/ACTIVE.md" in front of a file
    // that was right there, and threw away the parser's own verdict, which is
    // exactly the thing the reader needs (#193).
    const failure = (error as { failure?: { problem?: unknown; fix?: unknown } }).failure;
    malformed = {
      problem: typeof failure?.problem === 'string' ? failure.problem : 'the frontmatter is not readable',
      fix:
        typeof failure?.fix === 'string'
          ? failure.fix
          : 'fix the `---` frontmatter block, then run doctor again',
    };
  }

  return {
    activeProgram:
      malformed !== null
        ? { malformed }
        : program === null
          ? null
          : {
              status: program.status,
              autopilot: {
                enabled: program.autopilot.enabled,
                clusterSize: program.autopilot.clusterSize,
                mergeGate: program.autopilot.mergeGate,
                verifyCommands: program.autopilot.verifyCommands,
              },
            },
    adapters: detectedAdapters(root).map((adapter) => adapter.id),
    trackerConnector: 'unprobed',
    worktreesUsable: existsSync(join(root, '.git')) ? true : null,
    baseProtected: 'unprobed',
  };
}
