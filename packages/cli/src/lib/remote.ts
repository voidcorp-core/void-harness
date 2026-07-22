// Fetch marketplace state from the configured GitHub repo using the `gh` CLI.
// We pass `Accept: application/vnd.github.raw` so we get raw file content
// instead of the base64-wrapped contents API envelope.

import { execFileSync } from 'node:child_process';
import { CORE_PLUGIN_NAME } from './packs.js';

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
  /** Usually absent in the catalog: the plugin.json (local or pinned) is the version of truth. */
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
 * undefined when the version cannot be derived (unreachable remote, no core
 * entry, or an entry with no resolvable version) — callers must NOT substitute
 * a stale literal (the old `0.1.0` fallback reintroduced the default-pin-stale
 * friction this repo already fixed, #67).
 *
 * The core version is read from the entry named `harness` (CORE_PLUGIN_NAME),
 * NOT `plugins[0]` — the catalog is not ordered by canonicity and its first
 * entry may be an unrelated, version-less product. Modern entries are sha-pinned
 * via `source`, so the version comes from the pinned plugin.json
 * (fetchPinnedPluginVersion), not a legacy top-level `.version`.
 */
/**
 * The catalog entry for the core plugin, selected BY NAME. Pure + exported so a
 * test locks the regression: the core is `harness`, never `plugins[0]` (the
 * catalog is unordered and its first entry can be an unrelated, version-less
 * product like `forge`, which silently yielded an undefined pin).
 */
export function selectCorePlugin(plugins: readonly RemotePlugin[]): RemotePlugin | undefined {
  return plugins.find((p) => p.name === CORE_PLUGIN_NAME);
}

export function resolveCorePin(repo: string): string | undefined {
  const remote = fetchRemoteMarketplace(repo);
  if (!remote.ok) return undefined;
  const core = selectCorePlugin(remote.value.plugins);
  if (!core) return undefined;
  const pinned = fetchPinnedPluginVersion(core, repo);
  return pinned.ok ? pinned.value : undefined;
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
 * Resolve where a catalog entry's content lives: which repo, under which base
 * path, at which ref. A **local/relative** source (`"./packages/core"`) means the
 * plugin is a subdirectory of the marketplace repo itself, versioned by its own
 * plugin.json at HEAD — the self-hosted case. External git sources pin via
 * sha (winning over ref). Returns undefined when no repo can be determined.
 */
export function pinnedCoordinates(
  source: RemotePlugin['source'],
  marketplaceRepo: string,
): { repo: string; basePath: string; ref: string } | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') {
    // Local source: strip the leading `./` and trailing `/`; the plugin lives in
    // the marketplace repo at HEAD (no external pin — the repo commit is the pin).
    const rel = source.replace(/^\.\//, '').replace(/\/$/, '');
    return { repo: marketplaceRepo, basePath: rel ? `${rel}/` : '', ref: 'HEAD' };
  }
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
export function fetchPinnedPluginVersion(plugin: RemotePlugin, marketplaceRepo: string): RemoteFetch<string> {
  const coords = pinnedCoordinates(plugin.source, marketplaceRepo);
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
export function fetchRemotePhilosophy(
  market: RemoteMarketplace,
  corePluginName: string,
  marketplaceRepo: string,
): RemoteFetch<string> {
  const core = market.plugins.find((p) => p.name === corePluginName);
  const coords = pinnedCoordinates(core?.source, marketplaceRepo);
  if (!coords) {
    return { ok: false, error: `catalog has no pinned source for plugin "${corePluginName}"` };
  }
  return ghFetchRaw(coords.repo, `${coords.basePath}PHILOSOPHY.md`, coords.ref);
}
