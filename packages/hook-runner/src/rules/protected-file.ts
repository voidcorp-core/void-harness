import { basename } from 'node:path';
import type { RuleVerdict } from '../enforcement/types.js';
import { allow, block } from './verdict.js';

function protectedReason(path: string): string | undefined {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  const base = basename(normalized);
  if (/^\.env(?:\..+)?$/.test(base) && !/\.(?:example|sample|template|dist)$/.test(base)) {
    return 'environment file with secrets';
  }
  if (/\.(?:pem|key|p12|pfx|keystore|jks|asc)$/.test(base) || /^id_(?:rsa|ed25519|ecdsa|dsa)$/.test(base)) {
    return 'private key / certificate';
  }
  if (/(?:\.npmrc|\.netrc|\.pgpass)$/.test(base)) return 'credential file';
  if (!base.endsWith('.md') && /(?:secret|credential)/.test(base)) return 'credential file';
  if (new Set([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'cargo.lock',
    'poetry.lock',
    'composer.lock',
  ]).has(base)) {
    return 'lockfile (regenerate via the package manager, do not hand-edit)';
  }
  if (/(^|\/)\.git\//.test(normalized)) return 'internal git metadata';
  return undefined;
}

export function protectedFile(paths: readonly string[]): RuleVerdict {
  for (const path of paths) {
    const reason = protectedReason(path);
    if (reason !== undefined) {
      return block('PROTECTED_FILE', `refusing to edit ${path}`, [`${path}: ${reason}`]);
    }
  }
  return allow();
}
