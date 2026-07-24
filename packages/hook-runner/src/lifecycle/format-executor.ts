import { spawnSync } from 'node:child_process';
import { normalizeToolCall } from '../enforcement/normalize.js';
import {
  boundedInteger,
  type Environment,
  findExecutable,
  type LifecycleExecution,
  safeExistingFiles,
} from './executor-shared.js';
import { formatCandidates } from './format.js';

export function executeFormat(
  rawInput: unknown,
  root: string,
  env: Environment,
): LifecycleExecution {
  const call = normalizeToolCall(rawInput);
  if (call.tool !== 'Edit' && call.tool !== 'Write' && call.tool !== 'apply_patch') {
    return { status: 'skipped', details: { reason: 'tool-not-applicable' } };
  }
  const files = safeExistingFiles(
    formatCandidates(call.edits.map((edit) => edit.path), root),
    root,
  );
  if (files.length === 0) {
    return { status: 'skipped', details: { reason: 'no-formattable-touched-file' } };
  }
  const biome = findExecutable('biome', root, env);
  if (biome === undefined) {
    return { status: 'skipped', details: { reason: 'formatter-unavailable' } };
  }
  const timeout = boundedInteger(
    env['VOID_HARNESS_FORMAT_TIMEOUT_MS'],
    10_000,
    100,
    30_000,
  );
  let formatted = 0;
  for (const file of files) {
    const result = spawnSync(biome, ['format', '--write', file], {
      cwd: root,
      env: { ...process.env, ...env },
      shell: false,
      stdio: 'ignore',
      timeout,
    });
    if (result.error !== undefined || result.status !== 0) {
      const timedOut = result.error?.message.includes('ETIMEDOUT') ?? false;
      return {
        status: 'degraded',
        details: {
          reason: timedOut ? 'timeout' : 'formatter-error',
          formatted,
          timeoutMs: timeout,
        },
      };
    }
    formatted += 1;
  }
  return { status: 'ok', details: { formatted } };
}
