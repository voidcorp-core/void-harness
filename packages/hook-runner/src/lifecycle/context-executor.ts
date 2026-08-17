import { join } from 'node:path';
import {
  type Environment,
  readJson,
  record,
} from './executor-shared.js';
import { voidReadPath } from '../void-layout.js';

/** Where the harness in this project came from. Undetermined when the version was
 * forced through the environment or when nothing readable was found — in which case
 * no caller may advise an update path it cannot vouch for. */
export type InstallSource = 'local' | 'marketplace';

export interface ResolvedInstall {
  readonly version: string;
  readonly source: InstallSource | undefined;
}

const VERSION_SHAPE = /^[0-9A-Za-z.+-]{1,64}$/;

function readVersion(path: string): string | undefined {
  const version = record(readJson(path))?.['version'];
  return typeof version === 'string' && VERSION_SHAPE.test(version) ? version : undefined;
}

/** Resolve the installed version together with the channel it came from, in one
 * pass over the same candidates, so the two can never disagree. */
export function resolveInstall(root: string, env: Environment): ResolvedInstall {
  const explicit = env['VOID_HARNESS_VERSION'];
  if (explicit !== undefined && VERSION_SHAPE.test(explicit)) {
    return { version: explicit, source: undefined };
  }

  const pluginRoot = env['CLAUDE_PLUGIN_ROOT'];
  if (pluginRoot !== undefined) {
    const version = readVersion(join(pluginRoot, '.claude-plugin', 'plugin.json'));
    // A plugin root IS the marketplace channel; its manifest carries no source field.
    if (version !== undefined) return { version, source: 'marketplace' };
  }

  const receipt = record(readJson(voidReadPath(root, 'receipts', 'install-v1.json')));
  const version = receipt?.['version'];
  if (typeof version === 'string' && VERSION_SHAPE.test(version)) {
    const declared = receipt?.['source'];
    const source = declared === 'local' || declared === 'marketplace' ? declared : undefined;
    return { version, source };
  }

  return { version: 'unknown', source: undefined };
}

export function installedVersion(root: string, env: Environment): string {
  return resolveInstall(root, env).version;
}
