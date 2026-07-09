// Fetch marketplace state from the configured GitHub repo using the `gh` CLI.
// We pass `Accept: application/vnd.github.raw` so we get raw file content
// instead of the base64-wrapped contents API envelope.

import { execFileSync } from 'node:child_process';

export interface RemotePluginSource {
  readonly source: string;
  readonly repo?: string;
  readonly url?: string;
  readonly path?: string;
  readonly ref?: string;
  readonly sha?: string;
}

export interface RemotePlugin {
  readonly name: string;
  /** Absent in the void-plugins catalog: the pinned plugin.json is the version of truth. */
  readonly version?: string;
  readonly description?: string;
  readonly source?: string | RemotePluginSource;
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

/**
 * The lockstep core version to pin, read from the marketplace HEAD. Returns
 * undefined when the remote is unreachable — callers must NOT substitute a
 * stale literal (the old `0.1.0` fallback reintroduced the default-pin-stale
 * friction this repo already fixed, #67). An undefined pin is surfaced to the
 * user as a failed checklist item, not silently written.
 */
export function resolveCorePin(repo: string): string | undefined {
  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) return undefined;
  // Lockstep model: every plugin shares one version. First plugin is canonical.
  return remote.value.plugins[0]?.version;
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

/**
 * Resolve where a catalog entry's pinned content lives: which repo, under
 * which base path, at which ref. The sha wins over the ref (it is the
 * effective pin); string sources are repo-local and have no remote pin.
 */
export function pinnedCoordinates(
  source: RemotePlugin['source'],
): { repo: string; basePath: string; ref: string } | undefined {
  if (!source || typeof source === 'string') return undefined;
  const ref = source.sha ?? source.ref ?? 'HEAD';
  if (source.source === 'github' && source.repo) {
    return { repo: source.repo, basePath: '', ref };
  }
  const match = source.url?.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match?.[1]) return undefined;
  return { repo: match[1], basePath: source.path ? `${source.path}/` : '', ref };
}

/**
 * Remote version of a catalog entry, read from the product repo's
 * plugin.json at the pinned commit. Falls back to the catalog version
 * field for legacy entries that still carry one.
 */
export function fetchPinnedPluginVersion(plugin: RemotePlugin): RemoteFetch<string> {
  const coords = pinnedCoordinates(plugin.source);
  if (!coords) {
    return plugin.version
      ? { ok: true, value: plugin.version }
      : { ok: false, error: `${plugin.name}: catalog entry has neither a pinned source nor a version` };
  }
  const raw = ghFetchRaw(coords.repo, `${coords.basePath}.claude-plugin/plugin.json`, coords.ref);
  if (!raw.ok) return raw;
  try {
    const version = (JSON.parse(raw.value) as { version?: string }).version;
    return version
      ? { ok: true, value: version }
      : { ok: false, error: `${plugin.name}: pinned plugin.json has no version` };
  } catch (err) {
    return { ok: false, error: `${plugin.name}: plugin.json parse error: ${(err as Error).message}` };
  }
}

/**
 * PHILOSOPHY.md lives next to the core plugin in the product repo, so its
 * location follows the core entry's pin instead of the catalog repo.
 */
export function fetchRemotePhilosophy(market: RemoteMarketplace, corePluginName: string): RemoteFetch<string> {
  const core = market.plugins.find((p) => p.name === corePluginName);
  const coords = pinnedCoordinates(core?.source);
  if (!coords) {
    return { ok: false, error: `catalog has no pinned source for plugin "${corePluginName}"` };
  }
  return ghFetchRaw(coords.repo, `${coords.basePath}PHILOSOPHY.md`, coords.ref);
}
