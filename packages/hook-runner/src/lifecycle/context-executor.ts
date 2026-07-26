import { join } from 'node:path';
import {
  type Environment,
  readJson,
  record,
} from './executor-shared.js';

export function installedVersion(root: string, env: Environment): string {
  const explicit = env['VOID_HARNESS_VERSION'];
  if (explicit !== undefined && /^[0-9A-Za-z.+-]{1,64}$/.test(explicit)) return explicit;
  const pluginRoot = env['CLAUDE_PLUGIN_ROOT'];
  const candidates = [
    pluginRoot === undefined
      ? undefined
      : join(pluginRoot, '.claude-plugin', 'plugin.json'),
    join(root, '.void', 'receipts', 'install-v1.json'),
  ];
  for (const path of candidates) {
    if (path === undefined) continue;
    const version = record(readJson(path))?.['version'];
    if (typeof version === 'string' && /^[0-9A-Za-z.+-]{1,64}$/.test(version)) {
      return version;
    }
  }
  return 'unknown';
}
