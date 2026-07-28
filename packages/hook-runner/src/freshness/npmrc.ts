// Locate an .npmrc so a private registry or corporate proxy is honoured.
//
// The contents are handed to `resolveRegistry`, which only ever extracts a
// `registry=` line and explicitly skips `//host/:_authToken=` lines. Nothing from
// this file is logged, cached, or sent anywhere — the caller reads it to decide
// which host to GET, and nothing else.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** An .npmrc is a few lines; anything larger is not a config we should be reading. */
const MAX_NPMRC_BYTES = 64 * 1024;

export interface NpmrcEnvironment {
  readonly [key: string]: string | undefined;
}

function readIfSmall(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_NPMRC_BYTES) return undefined;
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Project .npmrc, else the user's, else undefined — npm's own precedence order. */
export function readNpmrc(cwd: string, env: NpmrcEnvironment): string | undefined {
  const project = readIfSmall(join(cwd, '.npmrc'));
  if (project !== undefined) return project;
  const home = env['HOME']?.trim();
  return home === undefined || home === '' ? undefined : readIfSmall(join(home, '.npmrc'));
}
