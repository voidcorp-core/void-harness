// `void-harness backlog-loop` — drive the autonomous Linear backlog loop.
//
// Each ticket runs in a FRESH `claude -p` process (true context reset). This
// command resolves the run config (flags > env > .void/autonomous.json >
// defaults), then hands off to the orchestrator. `--dry-run` resolves and
// prints the config without spawning anything. See
// docs/specs/2026-06-18-backlog-loop-observability.md.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSubscription, type BillingPreflight } from '../lib/backlog/billing.js';
import { baseBranchFromSymbolicRef, evaluateBranchProtection } from '../lib/backlog/branch-protection.js';
import {
  type BacklogConfig,
  type FileConfig,
  parseFlags,
  resolveConfig,
} from '../lib/backlog/config.js';
import {
  branchFromEvents,
  type IntegrateRun,
  integrateTicket,
  type PrSpec,
  parsePrFile,
} from '../lib/backlog/integrate.js';
import { hasLinearMcpServer } from '../lib/backlog/mcp.js';
import { type IterationResult, runIteration, runLoop } from '../lib/backlog/orchestrator.js';
import { AUTONOMOUS_SETTINGS, buildClaudeArgs, renderPrompt } from '../lib/backlog/prompt.js';
import type { Write } from '../lib/backlog/render.js';
import { renderSummary } from '../lib/backlog/summary.js';
import { hasConfig, runWizard, wizardShouldRun } from '../lib/backlog/wizard.js';
import { banner, blank, c, divider, footer, line, meta, status } from '../lib/render.js';

const CONFIG_REL = '.void/autonomous.json';
const MCP_REL = '.mcp.json';

/** Read `.void/autonomous.json`, or undefined if missing/invalid. */
function loadFileConfig(root: string): FileConfig | undefined {
  const path = join(root, CONFIG_REL);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FileConfig;
  } catch {
    status(`${CONFIG_REL} is not valid JSON — ignoring it.`, 'warn');
    return undefined;
  }
}

function billingLabel(cfg: BacklogConfig, billing: BillingPreflight): string {
  if (cfg.allowApi) return c.yellow('API allowed (--allow-api)');
  if (billing.stripped.length > 0) return `subscription (stripping ${billing.stripped.join(', ')})`;
  return 'subscription';
}

function printConfig(cfg: BacklogConfig, billing: BillingPreflight): void {
  meta('scope', cfg.linearScope);
  meta('target', cfg.targetState);
  meta('review', cfg.reviewState);
  meta('branch', cfg.branchPrefix);
  meta('max', String(cfg.maxIterations));
  meta('max-fail', String(cfg.maxFailures));
  meta('model', cfg.model ?? c.dim('(CLI default)'));
  meta('auto-merge', cfg.autoMerge ? 'yes' : 'no');
  meta('billing', billingLabel(cfg, billing));
  meta('stream', cfg.stream ? 'live' : 'text (--no-stream)');
  if (cfg.fullAuto) meta('full-auto', c.yellow('yes (sandbox-gated)'));
}

function printHelp(): void {
  process.stdout.write(
    `
void-harness backlog-loop — drain a Linear backlog, one fresh session per ticket.

Each eligible ticket is worked end-to-end in a fresh \`claude -p\` process (pick,
plan, execute test-first, verify, ship a PR), then the next ticket starts with a
clean context. The loop runs continuously and prints a final summary; you do the
HITL once, at PR merge. Token usage is billed to your Claude subscription (API
credentials are stripped from the worker env unless --allow-api).

Usage:
  void-harness backlog-loop [options]

Options:
  --scope <text>        Linear view to drain (team/project/cycle description).
  --target <state>      State that means "ready to work" (default: Todo).
  --review <state>      State a finished ticket moves to (default: In Review).
  --branch-prefix <p>   Per-ticket branch prefix (default: auto/).
  --max <n>             Max tickets this run (default: 20).
  --max-failures <n>    Consecutive failures before stopping (default: 2).
  --model <name>        Model for the worker sessions (default: CLI default).
  --auto-merge          Merge the PR after green CI + close the ticket.
  --allow-api           Do NOT strip API creds (allows pay-per-token billing).
  --no-stream           Disable the live flux (plain text fallback).
  --no-interactive      Skip the first-run wizard (use defaults/env/flags).
  --full-auto           Pass --dangerously-skip-permissions (sandbox only).
  --dry-run             Resolve + print config and exit, spawning nothing.
  --help, -h            Print this message.

Config resolves from flags, then env vars (LINEAR_SCOPE, TARGET_STATE, ...),
then .void/autonomous.json, then defaults. With no config file, a first-run
wizard offers to create one.

Linear access: the worker reaches Linear ONLY through a project .mcp.json
server keyed "linear", authenticated by a token from the environment (the
interactive claude.ai connector is not available in a headless worker). The
worker is bound to that file with --strict-mcp-config, so it never sees your
other connected servers. Declare it before running, e.g.:

  // .mcp.json
  { "mcpServers": { "linear": { "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "headers": { "Authorization": "Bearer \${LINEAR_API_KEY}" } } } }

then export LINEAR_API_KEY (a restricted Linear API key) in the shell that
launches the loop. To keep the token out of the environment entirely, use a
"headersHelper" command instead that reads it from a secret store (OS keychain,
vault) at session start. backlog-loop fails loud if this server is missing.
`.trimStart(),
  );
}

export async function backlogLoop(args: readonly string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const flags = parseFlags(args);

  // First-run wizard: offer to create .void/autonomous.json when none exists,
  // at an interactive terminal, unless --no-interactive was passed.
  let file = loadFileConfig(cwd);
  if (
    file === undefined &&
    wizardShouldRun(
      hasConfig(cwd),
      process.stdin.isTTY === true,
      !args.includes('--no-interactive'),
    )
  ) {
    file = await runWizard(cwd);
  }

  const cfg = resolveConfig({ flags, env: process.env, file });
  const billing = assertSubscription(process.env, cfg.allowApi);

  banner('backlog-loop');
  printConfig(cfg, billing);

  if (!billing.ok) {
    blank();
    status(billing.reason ?? 'billing pre-flight failed.', 'err');
    process.exitCode = 1;
    return;
  }

  if (cfg.dryRun) {
    footer('dry-run: no session launched.');
    return;
  }

  const root = gitRoot(); // throws with a clear message if outside a repo
  preflight(cfg, process.env, root);
  await runBacklog(cfg, root);
}

/** Resolve the remote's default branch (the PR base), defaulting to `main`. */
function baseBranch(root: string): string {
  const probe = spawnSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return baseBranchFromSymbolicRef(probe.stdout ?? '') ?? 'main';
}

/**
 * The durable A1 boundary: server-side branch protection on the base branch.
 * The remote refuses non-PR pushes regardless of what the worker runs, so a
 * confirmed-unprotected base is a hard refusal. An indeterminate probe (no
 * admin rights, gh missing, offline) only warns — it must not silently pass,
 * but it also must not block an operator who simply lacks the admin API scope.
 */
function assertBaseBranchProtected(root: string): void {
  const base = baseBranch(root);
  const probe = spawnSync(
    'gh',
    ['api', `repos/{owner}/{repo}/branches/${base}/protection`],
    { cwd: root, encoding: 'utf8' },
  );
  if (probe.error !== undefined) {
    status(`could not probe branch protection for "${base}" (gh: ${probe.error.message}).`, 'warn');
    return;
  }
  const verdict = evaluateBranchProtection({
    ok: probe.status === 0,
    stdout: probe.stdout ?? '',
    stderr: probe.stderr ?? '',
  });
  if (verdict.kind === 'unprotected') {
    throw new Error(
      `base branch "${base}" is NOT protected on the remote. The autonomous loop relies ` +
        'on server-side branch protection as the durable boundary against a direct push to ' +
        `the base. Protect "${base}" (GitHub Settings -> Branches: require a PR before ` +
        'merging) before an unattended run.',
    );
  }
  if (verdict.kind === 'unknown') {
    status(`branch protection for "${base}" could not be confirmed: ${verdict.reason}.`, 'warn');
  }
}

/** The git toplevel, or throw a clear error if not in a repository. */
function gitRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('backlog-loop must run inside a git repository.');
  }
}

/** Run-time safety gate (the security floor is the allowlist + hooks, not this). */
function preflight(cfg: BacklogConfig, env: NodeJS.ProcessEnv, root: string): void {
  if (env.VOID_HARNESS_ALLOW_DANGEROUS === '1' || env.VOID_HARNESS_ALLOW_SECRET_EDIT === '1') {
    throw new Error(
      'refusing to run with VOID_HARNESS_ALLOW_* set — the security floor must stay on.',
    );
  }
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (dirty !== '') {
    throw new Error('working tree is dirty. Commit or stash before an autonomous run.');
  }
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error("the 'claude' CLI is not on PATH.");
  }
  if (cfg.fullAuto && (env.VOID_SANDBOX === undefined || env.VOID_SANDBOX === '')) {
    throw new Error(
      '--full-auto requires VOID_SANDBOX to be set (run inside a disposable container).',
    );
  }
  // The worker reaches Linear only through a project `.mcp.json` server keyed
  // "linear" (token-authenticated, see docs). Fail loud here rather than spawn a
  // worker that can never pick a ticket.
  const mcpPath = join(root, MCP_REL);
  const mcpRaw = existsSync(mcpPath) ? readFileSync(mcpPath, 'utf8') : undefined;
  if (!hasLinearMcpServer(mcpRaw)) {
    throw new Error(
      `${MCP_REL} must declare a "linear" MCP server (token-authenticated) so the ` +
        'worker can reach the backlog. See backlog-loop --help.',
    );
  }
  assertBaseBranchProtected(root);
}

/** Spawn-backed command runner for the orchestrator's push + PR steps. */
const spawnRunner: IntegrateRun = (cmd, args, cwd) => {
  const p = spawnSync(cmd, [...args], { cwd, encoding: 'utf8' });
  return { ok: p.status === 0, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
};

/** Read the worker-written PR description, or undefined to let `gh --fill`. */
function loadPrSpec(workdir: string, ticket: string): PrSpec | undefined {
  const path = join(workdir, '.void', 'autonomous-runs', `${ticket}.pr.md`);
  if (!existsSync(path)) return undefined;
  return parsePrFile(readFileSync(path, 'utf8'));
}

/**
 * The trusted orchestrator's half of A1: on a COMPLETED ticket, push the
 * worker's branch (explicit refspec, no force) and open its PR. The worker is
 * commit-only, so this is the ONLY path to the remote. `workdir` is where the
 * worker committed (the run root today; the per-ticket worktree after Step 3).
 */
function integrateCompleted(
  result: IterationResult,
  workdir: string,
  base: string,
  cfg: BacklogConfig,
  out: Write,
): void {
  const ticket = result.ticket;
  if (ticket === undefined) {
    out(c.yellow('  ! completed without a ticket id — skipping push/PR.'));
    return;
  }
  const branch = branchFromEvents(result.events, `${cfg.branchPrefix}${ticket}`);
  const prSpec = loadPrSpec(workdir, ticket);
  const outcome = integrateTicket({
    branch,
    base,
    cwd: workdir,
    ...(prSpec !== undefined ? { prSpec } : {}),
    ...(cfg.autoMerge ? { autoMerge: true } : {}),
    run: spawnRunner,
  });
  if (!outcome.pushed) {
    out(c.red(`  ✗ push of ${branch} failed: ${outcome.error ?? 'unknown error'}`));
    return;
  }
  if (outcome.prRef !== undefined) out(c.green(`  ✓ PR opened: ${outcome.prRef}`));
  if (outcome.error !== undefined) out(c.yellow(`  ! PR/merge step: ${outcome.error}`));
  if (outcome.autoMergeRequested === true) out(c.dim('  · auto-merge armed (remote gates).'));
}

async function runBacklog(cfg: BacklogConfig, root: string): Promise<void> {
  const runDir = join(root, '.void', 'autonomous-runs');
  mkdirSync(runDir, { recursive: true });
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const logPath = join(runDir, `${sha}-${process.pid}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const settingsDir = mkdtempSync(join(tmpdir(), 'void-backlog-'));
  const settingsPath = join(settingsDir, 'settings.autonomous.json');
  writeFileSync(settingsPath, JSON.stringify(AUTONOMOUS_SETTINGS, null, 2));

  const out = (l: string) => process.stdout.write(`${l}\n`);
  const claudeArgs = buildClaudeArgs(settingsPath, join(root, MCP_REL), cfg);
  const prompt = renderPrompt(cfg);
  const base = baseBranch(root);

  blank();
  const iterate = async (i: number): Promise<IterationResult> => {
    divider();
    line(c.dim(`iteration ${i}/${cfg.maxIterations} (fresh session)`));
    const result = await runIteration({
      command: 'claude',
      claudeArgs,
      prompt,
      cwd: root,
      env: process.env,
      allowApi: cfg.allowApi,
      stream: cfg.stream,
      write: out,
      onRaw: (raw) => logStream.write(raw.endsWith('\n') ? raw : `${raw}\n`),
    });
    // The worker is commit-only; the trusted orchestrator pushes + opens the PR.
    if (result.status === 'completed') integrateCompleted(result, root, base, cfg, out);
    return result;
  };

  const summary = await runLoop({
    maxIterations: cfg.maxIterations,
    maxFailures: cfg.maxFailures,
    iterate,
  });
  renderSummary(summary, out);
  logStream.end();
  footer(c.dim(`raw log: ${logPath}`));
  process.exitCode = summary.blocked + summary.failed;
}
