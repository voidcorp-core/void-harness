import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { collectFiles, commitIfMoved, resetSandbox, setupSandbox } from './sandbox.js';
import type { EvalCase, RunOnce, RunOutcome } from './types.js';

// The `claude -p` invocation below is the ONLY part exempt from unit testing (it
// spawns a paid, non-deterministic LLM); its logic is exercised by the real
// `pnpm eval` run. The deterministic sandbox/git/fs helpers it composes live in
// sandbox.ts and ARE unit-tested.

export interface AdapterConfig {
  /** Cheap model by default (llm-cost-discipline). */
  readonly model: string;
  /** Per-run wall-clock cap — the CLI has no max-output-tokens flag, so time bounds it. */
  readonly timeoutMs: number;
  /** Bounded retries on an infra failure (timeout / crash), not on a bad result. */
  readonly retries: number;
}

export const DEFAULT_ADAPTER: AdapterConfig = { model: 'haiku', timeoutMs: 180_000, retries: 1 };

// The spawned agent needs to edit files and run the task's tools inside the
// sandbox — but NOT arbitrary shell (no curl/ssh/etc.). acceptEdits auto-approves
// Write/Edit; the allow-list scopes Bash to the commands a pilot legitimately
// needs. This is not an OS path-jail (see README "containment"); it removes the
// arbitrary-exec + secret-exfil latitude that `--dangerously-skip-permissions`
// (which the harness's own doctrine gates behind VOID_SANDBOX) would grant.
const ALLOWED_TOOLS =
  'Read,Write,Edit,Bash(git:*),Bash(node:*),Bash(pnpm:*),Bash(npx:*),Bash(vitest:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*)';

// Pass a MINIMAL env, not the maintainer's whole shell — the spawned agent must
// not be able to read API keys / tokens / cloud creds out of process.env. HOME is
// kept so claude resolves its auth (keychain / ~/.claude); nothing secret-bearing.
const SAFE_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ'];
function scrubbedEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of SAFE_ENV_KEYS) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function salvageCost(stdout: unknown): number {
  if (typeof stdout !== 'string') return 0;
  try {
    return (JSON.parse(stdout) as { total_cost_usd?: number }).total_cost_usd ?? 0;
  } catch {
    return 0;
  }
}

function invokeClaude(
  dir: string,
  prompt: string,
  skillBody: string | undefined,
  cfg: AdapterConfig,
): { ok: boolean; costUsd: number; error?: string } {
  // Hermetic: --setting-sources "" loads zero settings (so no global plugins/
  // skills — and the harness's own hooks — reach the run), cwd is a fresh dir (no
  // inherited CLAUDE.md; verified the user-level CLAUDE.md does NOT leak). OAuth
  // auth stays intact (we do NOT relocate CLAUDE_CONFIG_DIR). The only difference
  // between the two conditions is the appended prose.
  const args = ['-p', prompt, '--model', cfg.model, '--output-format', 'json', '--setting-sources', '', '--permission-mode', 'acceptEdits', '--allowedTools', ALLOWED_TOOLS];
  if (skillBody !== undefined) args.push('--append-system-prompt', skillBody);
  try {
    const raw = execFileSync('claude', args, { cwd: dir, encoding: 'utf8', timeout: cfg.timeoutMs, maxBuffer: 64 * 1024 * 1024, env: scrubbedEnv() });
    const json = JSON.parse(raw) as { is_error?: boolean; total_cost_usd?: number; result?: string };
    const ok = json.is_error !== true;
    return ok ? { ok, costUsd: json.total_cost_usd ?? 0 } : { ok, costUsd: json.total_cost_usd ?? 0, error: String(json.result ?? 'run error') };
  } catch (err) {
    // A timeout / non-zero exit still burned tokens and often printed JSON-with-cost
    // on stdout before failing — salvage it so cost is not under-reported.
    const e = err as { message?: string; stdout?: string };
    return { ok: false, costUsd: salvageCost(e.stdout), error: e.message ?? 'run failed' };
  }
}

/** Build a RunOnce port bound to one eval case. Each call runs in a throwaway sandbox. */
export function createClaudeRunOnce(evalCase: EvalCase, cfg: AdapterConfig = DEFAULT_ADAPTER): RunOnce {
  return ({ skillBody }) => {
    const { dir, baseSha } = setupSandbox(evalCase.fixture);
    try {
      let last: { ok: boolean; costUsd: number; error?: string } = { ok: false, costUsd: 0, error: 'not run' };
      let totalCost = 0;
      for (let attempt = 0; attempt <= cfg.retries; attempt += 1) {
        last = invokeClaude(dir, evalCase.prompt, skillBody, cfg);
        totalCost += last.costUsd;
        if (last.ok) break;
        if (attempt < cfg.retries) resetSandbox(dir, baseSha);
      }
      const outcome: RunOutcome = {
        ok: last.ok,
        costUsd: totalCost,
        files: collectFiles(dir),
        lastCommit: commitIfMoved(dir, baseSha),
        ...(last.error !== undefined ? { error: last.error } : {}),
      };
      return Promise.resolve(outcome);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
