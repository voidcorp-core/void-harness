// Fetch marketplace state from the configured GitHub repo using the `gh` CLI.
// We pass `Accept: application/vnd.github.raw` so we get raw file content
// instead of the base64-wrapped contents API envelope.

import { execFileSync } from 'node:child_process';

export interface RemotePlugin {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
}

export interface RemoteMarketplace {
  readonly name: string;
  readonly plugins: readonly RemotePlugin[];
}

export type RemoteFetch<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function ghFetchRaw(repo: string, path: string, ref = 'HEAD'): RemoteFetch<string> {
  try {
    const stdout = execFileSync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${path}?ref=${ref}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, value: stdout };
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8');
    return { ok: false, error: (stderr ?? e.message ?? 'unknown gh error').trim() };
  }
}

export function fetchRemoteMarketplace(repo: string): RemoteFetch<RemoteMarketplace> {
  const raw = ghFetchRaw(repo, '.claude-plugin/marketplace.json');
  if (!raw.ok) return raw;
  try {
    const parsed = JSON.parse(raw.value) as RemoteMarketplace;
    if (!Array.isArray(parsed.plugins)) {
      return { ok: false, error: 'marketplace.json: missing plugins[]' };
    }
    return { ok: true, value: parsed };
  } catch (err) {
    return { ok: false, error: `marketplace.json parse error: ${(err as Error).message}` };
  }
}

export function fetchRemotePhilosophy(repo: string): RemoteFetch<string> {
  return ghFetchRaw(repo, 'packages/core/PHILOSOPHY.md');
}
