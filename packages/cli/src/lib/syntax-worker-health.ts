// tdd-cover: e2e packages/cli/src/lib/syntax-delivery.test.ts
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Build-owned identity header permits health checks without executing code. */
export function syntaxWorkerHealth(hooksDirectory: string): string | undefined {
  try {
    const parent = readFileSync(join(hooksDirectory, '_void-hook.mjs'), 'utf8');
    const header = parent.split('\n', 1)[0];
    const prefix = '// syntax-worker: ';
    if (header === undefined || !header.startsWith(prefix)) return 'syntax worker identity metadata missing';
    const identity: unknown = JSON.parse(header.slice(prefix.length));
    if (!identity || typeof identity !== 'object'
      || !('sha256' in identity) || typeof identity.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(identity.sha256)
      || !('bytes' in identity) || typeof identity.bytes !== 'number'
      || !Number.isSafeInteger(identity.bytes) || identity.bytes < 1 || identity.bytes > 8 * 1024 * 1024) {
      return 'syntax worker identity metadata invalid';
    }
    const worker = join(hooksDirectory, '_syntax-worker.cjs');
    if (statSync(worker).size !== identity.bytes
      || createHash('sha256').update(readFileSync(worker)).digest('hex') !== identity.sha256) {
      return 'incompatible syntax worker; repair the harness installation';
    }
    return undefined;
  } catch {
    return 'syntax worker missing or unreadable; repair the harness installation';
  }
}
