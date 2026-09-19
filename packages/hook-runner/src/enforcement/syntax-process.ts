// tdd-cover: e2e packages/hook-runner/src/enforcement/syntax-inspection.test.ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SYNTAX_OPERATION_BUDGET_MS, syntaxResult, type SyntaxInput, type SyntaxResult } from './syntax-contract.js';
import { SYNTAX_WORKER_IDENTITY } from './syntax-worker-identity.generated.js';

// Build substitutes these constants for any relocated artifact, including
// source self-host. Direct source execution uses this checkout's built worker.
declare const __VOID_SYNTAX_WORKER_URL__: string;
declare const __VOID_SYNTAX_WORKER_IDENTITY__: typeof SYNTAX_WORKER_IDENTITY;

export function runSyntaxWorker(root: string, input: SyntaxInput, remainingMs: number): SyntaxResult {
  const started = performance.now();
  const worker = fileURLToPath(new URL(typeof __VOID_SYNTAX_WORKER_URL__ === 'string'
    ? __VOID_SYNTAX_WORKER_URL__ : '../../../core/hooks/_syntax-worker.cjs', import.meta.url));
  const identity = typeof __VOID_SYNTAX_WORKER_IDENTITY__ === 'object'
    ? __VOID_SYNTAX_WORKER_IDENTITY__ : SYNTAX_WORKER_IDENTITY;
  try {
    if (identity.bytes > 8 * 1024 * 1024 || statSync(worker).size !== identity.bytes
      || createHash('sha256').update(readFileSync(worker)).digest('hex') !== identity.sha256) {
      return { version: 1, kind: 'unavailable' };
    }
    const timeout = Math.min(SYNTAX_OPERATION_BUDGET_MS, remainingMs) - (performance.now() - started);
    if (timeout < 1) return { version: 1, kind: 'limit' };
    const child = spawnSync(process.execPath, ['--max-old-space-size=128', worker], {
      cwd: root, env: {}, encoding: 'utf8', timeout: Math.ceil(timeout), killSignal: 'SIGKILL',
      maxBuffer: 65_536, input: JSON.stringify({ version: 1, ...input }), windowsHide: true,
    });
    if (child.error !== undefined || child.status !== 0 || performance.now() - started > remainingMs) {
      return { version: 1, kind: 'limit' };
    }
    return syntaxResult(JSON.parse(child.stdout)) ?? { version: 1, kind: 'unavailable' };
  } catch {
    return { version: 1, kind: 'unavailable' };
  }
}
