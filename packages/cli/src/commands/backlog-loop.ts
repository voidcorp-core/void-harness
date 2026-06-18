// `void-harness backlog-loop` — drive the autonomous Linear backlog loop.
//
// Each ticket runs in a FRESH `claude -p` process (true context reset). This
// command resolves the run config (flags > env > .void/autonomous.json >
// defaults), then hands off to the orchestrator. `--dry-run` resolves and
// prints the config without spawning anything. See
// docs/specs/2026-06-18-backlog-loop-observability.md.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { banner, blank, c, footer, line, meta, status } from '../lib/render.js';
import { type BacklogConfig, type FileConfig, parseFlags, resolveConfig } from '../lib/backlog/config.js';

const CONFIG_REL = '.void/autonomous.json';

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

function printConfig(cfg: BacklogConfig): void {
  meta('scope', cfg.linearScope);
  meta('target', cfg.targetState);
  meta('review', cfg.reviewState);
  meta('branch', cfg.branchPrefix);
  meta('max', String(cfg.maxIterations));
  meta('max-fail', String(cfg.maxFailures));
  meta('model', cfg.model ?? c.dim('(CLI default)'));
  meta('auto-merge', cfg.autoMerge ? 'yes' : 'no');
  meta('billing', cfg.allowApi ? c.yellow('API allowed (--allow-api)') : 'subscription');
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
  --full-auto           Pass --dangerously-skip-permissions (sandbox only).
  --dry-run             Resolve + print config and exit, spawning nothing.
  --help, -h            Print this message.

Config resolves from flags, then env vars (LINEAR_SCOPE, TARGET_STATE, ...),
then .void/autonomous.json, then defaults. With no config file, a first-run
wizard offers to create one.
`.trimStart(),
  );
}

export async function backlogLoop(args: readonly string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const root = process.cwd();
  const flags = parseFlags(args);
  const file = loadFileConfig(root);
  const cfg = resolveConfig({ flags, env: process.env, file });

  banner('backlog-loop');
  printConfig(cfg);

  if (cfg.dryRun) {
    footer('dry-run: no session launched.');
    return;
  }

  // The orchestrator (spawn + live stream + summary) lands in a later slice.
  // Until then, --dry-run is the only supported path.
  blank();
  status('orchestrator not wired yet — re-run with --dry-run.', 'warn');
}
