import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  boundedInteger,
  type Environment,
  findExecutable,
  type LifecycleExecution,
  readJson,
} from './executor-shared.js';
import {
  configuredTypecheck,
  nearestTsconfigs,
} from './typecheck.js';

function runGit(
  root: string,
  args: readonly string[],
  env: Environment,
): { readonly ok: boolean; readonly output: string } {
  const git = findExecutable('git', root, env);
  if (git === undefined) return { ok: false, output: '' };
  const result = spawnSync(git, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    output: result.status === 0 ? result.stdout : '',
  };
}

function changedTypeScript(root: string, env: Environment): string[] | undefined {
  const tracked = runGit(
    root,
    ['diff', '--name-only', '--diff-filter=ACM', 'HEAD'],
    env,
  );
  const untracked = runGit(
    root,
    ['ls-files', '--others', '--exclude-standard'],
    env,
  );
  if (!tracked.ok || !untracked.ok) return undefined;
  return [...new Set(`${tracked.output}\n${untracked.output}`.split(/\r?\n/))]
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && !path.endsWith('.d.ts'));
}

function typeErrors(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((line) => /error TS\d+|error:/i.test(line))
    .slice(0, 20)
    .join('\n')
    .slice(0, 12_000);
}

export function executeTypecheck(
  root: string,
  env: Environment,
): LifecycleExecution {
  const changed = changedTypeScript(root, env);
  if (changed === undefined) {
    return { status: 'skipped', details: { reason: 'non-git-or-git-unavailable' } };
  }
  if (changed.length === 0) {
    return { status: 'skipped', details: { reason: 'no-touched-typescript' } };
  }
  const configs = nearestTsconfigs(changed, root, existsSync);
  const configured = configuredTypecheck(readJson(join(root, '.void', 'config.json')));
  const configuredArgv = 'argv' in configured ? configured.argv : undefined;
  const warning = 'warning' in configured ? configured.warning : undefined;
  const fallback = findExecutable('tsc', root, env);
  const argv = configuredArgv ?? (fallback === undefined ? undefined : [fallback, '--noEmit']);
  if (argv === undefined) {
    return {
      status: 'skipped',
      details: {
        reason: 'typechecker-unavailable',
        ...(warning === undefined ? {} : { warning }),
      },
      ...(warning === undefined ? {} : { diagnostic: `stop-typecheck: ${warning}\n` }),
    };
  }
  const executablePath = findExecutable(argv[0] ?? '', root, env);
  if (executablePath === undefined) {
    return {
      status: 'degraded',
      details: { reason: 'configured-executable-unavailable' },
    };
  }
  const timeout = boundedInteger(
    env['VOID_HARNESS_TYPECHECK_TIMEOUT_MS'],
    45_000,
    100,
    120_000,
  );
  const args = argv.slice(1);
  const isTsc = argv.some((argument) =>
    /(?:^|[\\/])tsc(?:\.cmd|\.exe)?$/.test(argument),
  );
  const invocations = isTsc && configs.length > 0
    ? configs.map((config) => [...args, '-p', config])
    : [args];
  let errors = '';
  for (const invocation of invocations) {
    const result = spawnSync(executablePath, invocation, {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      shell: false,
      timeout,
      maxBuffer: 1024 * 1024,
    });
    if (result.error !== undefined) {
      const timedOut = result.error.message.includes('ETIMEDOUT');
      return {
        status: 'degraded',
        details: {
          reason: timedOut ? 'timeout' : 'execution-error',
          timeoutMs: timeout,
        },
        diagnostic: timedOut
          ? `stop-typecheck: typecheck exceeded ${timeout}ms; advisory result degraded.\n`
          : 'stop-typecheck: typecheck could not execute; advisory result degraded.\n',
      };
    }
    if (result.status !== 0) {
      errors += `${typeErrors(`${result.stdout}\n${result.stderr}`)}\n`;
    }
  }
  const bounded = errors.trim().slice(0, 12_000);
  if (bounded !== '') {
    return {
      status: 'degraded',
      details: { reason: 'type-errors', configs: invocations.length },
      diagnostic:
        'stop-typecheck (advisory): type errors in the touched TypeScript surface:\n' +
        `${bounded}\nResolve before claiming done. This never blocks.\n`,
    };
  }
  return {
    status: 'ok',
    details: {
      checkedConfigs: invocations.length,
      ...(warning === undefined ? {} : { warning }),
    },
    ...(warning === undefined ? {} : { diagnostic: `stop-typecheck: ${warning}\n` }),
  };
}
