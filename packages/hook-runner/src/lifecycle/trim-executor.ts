import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import {
  boundedInteger,
  type Environment,
  type LifecycleExecution,
  within,
} from './executor-shared.js';
import {
  extractToolOutput,
  planOutputTrim,
} from './trim.js';

export interface TrimExecution extends LifecycleExecution {
  readonly output?: {
    readonly hookSpecificOutput: {
      readonly hookEventName: 'PostToolUse';
      readonly updatedToolOutput: string;
      readonly additionalContext: string;
    };
  };
}

function safeOutputDirectory(root: string): string | undefined {
  try {
    const canonicalRoot = realpathSync(root);
    const directory = join(root, '.void', 'outputs');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    const canonicalDirectory = realpathSync(directory);
    if (
      !info.isDirectory()
      || info.isSymbolicLink()
      || !within(canonicalRoot, canonicalDirectory)
    ) {
      return undefined;
    }
    return canonicalDirectory;
  } catch {
    return undefined;
  }
}

export function executeTrim(
  rawInput: unknown,
  root: string,
  env: Environment,
): TrimExecution {
  if (env['VOID_HARNESS_NO_TRIM'] === '1') {
    return { status: 'skipped', details: { reason: 'disabled' } };
  }
  const extracted = extractToolOutput(rawInput);
  if (extracted === undefined) {
    return { status: 'skipped', details: { reason: 'output-not-applicable' } };
  }
  const thresholdBytes = boundedInteger(
    env['VOID_HARNESS_TRIM_BYTES'],
    12_000,
    1,
    10 * 1024 * 1024,
  );
  if (Buffer.byteLength(extracted.text, 'utf8') <= thresholdBytes) {
    return { status: 'skipped', details: { reason: 'below-threshold' } };
  }
  const directory = safeOutputDirectory(root);
  if (directory === undefined) {
    return {
      status: 'degraded',
      details: { reason: 'unsafe-output-directory' },
    };
  }
  const hash = createHash('sha256').update(extracted.text).digest('hex').slice(0, 12);
  const tool = extracted.tool.replaceAll(/[^A-Za-z0-9_]/g, '_').slice(0, 80);
  const file = join(directory, `${tool}-${process.pid}-${Date.now()}-${hash}.log`);
  const spillPath = relative(realpathSync(root), file).replaceAll('\\', '/');
  const plan = planOutputTrim(extracted.text, {
    tool: extracted.tool,
    thresholdBytes,
    spillPath,
  });
  if (plan === undefined) {
    return { status: 'skipped', details: { reason: 'below-threshold' } };
  }
  try {
    writeFileSync(file, plan.fullOutput, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch {
    return { status: 'degraded', details: { reason: 'spill-write-failed' } };
  }
  return {
    status: 'ok',
    details: {
      originalBytes: plan.originalBytes,
      spillPath,
    },
    output: {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: plan.updatedToolOutput,
        additionalContext: plan.note,
      },
    },
  };
}
