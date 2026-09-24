// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import type { DoctorPaths } from '../../verticals/development/doctor.js';

export type Environment = Readonly<Record<string, string | undefined>>;
const gitPath = z.string().min(1).refine((value) => !value.includes('\0'));

export function repositoryPaths(cwd: string, environment: Environment): DoctorPaths | undefined {
  const root = gitValue(cwd, ['rev-parse', '--show-toplevel'], environment);
  if (root === undefined) return undefined;
  const repository = resolve(root);
  const common = gitValue(repository, ['rev-parse', '--git-common-dir'], environment);
  if (common === undefined) return undefined;
  const gitCommonDirectory = isAbsolute(common) ? common : resolve(repository, common);
  const stateDirectory = join(repository, '.void', 'machine');
  const xdg = environment['XDG_CACHE_HOME'];
  const home = environment['HOME'];
  const cacheDirectory = xdg !== undefined ? join(xdg, 'void-machine')
    : home !== undefined ? join(home, '.cache', 'void-machine') : join(stateDirectory, 'cache');
  return { repository, gitCommonDirectory, stateDirectory, cacheDirectory };
}

function gitValue(cwd: string, args: readonly string[], environment: Environment): string | undefined {
  const result = spawnSync('git', [...args], {
    cwd, env: { ...environment }, shell: false, windowsHide: true,
    timeout: 5000, maxBuffer: 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    // Remove Git's record terminator, not significant spaces in a path.
    const parsed = gitPath.safeParse(value.replace(/\r?\n$/, ''));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
