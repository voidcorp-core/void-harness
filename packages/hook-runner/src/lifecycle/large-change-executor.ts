import { spawnSync } from 'node:child_process';
import {
  boundedInteger,
  type Environment,
  findExecutable,
  type LifecycleExecution,
} from './executor-shared.js';
import {
  assessLargeChange,
  hasLargeChangeJustification,
  parseAddedLines,
} from './large-change.js';

interface GitResult {
  readonly ok: boolean;
  readonly output: string;
}

function runGit(
  git: string,
  root: string,
  args: readonly string[],
  env: Environment,
): GitResult {
  const result = spawnSync(git, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    output: result.status === 0 ? result.stdout.trim() : '',
  };
}

function verifiedRef(
  git: string,
  root: string,
  ref: string,
  env: Environment,
): boolean {
  if (ref === '' || /[\r\n\u0000]/u.test(ref)) return false;
  return runGit(
    git,
    root,
    ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`],
    env,
  ).ok;
}

function baseRef(
  git: string,
  root: string,
  env: Environment,
): string | undefined {
  const configured = env['VOID_HARNESS_BASE_REF']?.trim();
  if (configured !== undefined && configured !== '') {
    return verifiedRef(git, root, configured, env) ? configured : undefined;
  }
  const upstream = runGit(
    git,
    root,
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    env,
  );
  const candidates = [
    upstream.ok ? upstream.output : '',
    'origin/main',
    'origin/master',
    'main',
    'master',
  ];
  return candidates.find((candidate) => verifiedRef(git, root, candidate, env));
}

export function executeLargeChange(
  root: string,
  env: Environment,
): LifecycleExecution {
  const git = findExecutable('git', root, env);
  if (git === undefined) {
    return { status: 'skipped', details: { reason: 'git-unavailable' } };
  }
  const base = baseRef(git, root, env);
  if (base === undefined) {
    const configuredBase = env['VOID_HARNESS_BASE_REF']?.trim();
    return {
      status: 'skipped',
      details: {
        reason: configuredBase === undefined || configuredBase === ''
          ? 'base-ref-unavailable'
          : 'configured-base-ref-invalid',
      },
    };
  }
  const mergeBase = runGit(git, root, ['merge-base', 'HEAD', base], env);
  if (!mergeBase.ok) {
    return { status: 'degraded', details: { reason: 'merge-base-failed' } };
  }
  const range = `${mergeBase.output}..HEAD`;
  const diff = runGit(
    git,
    root,
    ['diff', '--numstat', '--no-renames', range, '--'],
    env,
  );
  const messages = runGit(git, root, ['log', '--format=%B', range, '--'], env);
  if (!diff.ok || !messages.ok) {
    return { status: 'degraded', details: { reason: 'change-query-failed' } };
  }
  const threshold = boundedInteger(
    env['VOID_HARNESS_LARGE_CHANGE_THRESHOLD']
      ?? env['VOIDCORP_LARGE_CL_THRESHOLD'],
    400,
    1,
    1_000_000,
  );
  const addedLines = parseAddedLines(diff.output);
  const justified = hasLargeChangeJustification(messages.output);
  const verdict = assessLargeChange({ addedLines, threshold, justified });
  const details = {
    baseRef: base,
    addedLines,
    threshold,
    justified,
    code: verdict.code,
  };
  if (verdict.code === 'ALLOW') return { status: 'ok', details };
  return {
    status: 'degraded',
    details,
    diagnostic:
      `${verdict.code}: ${verdict.message}\n` +
      `- ${verdict.evidence.join('\n- ')}\n`,
  };
}
