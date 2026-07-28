// Registry adapter: the only place that talks to the network for freshness.
//
// Read-only and outbound-minimal by construction. It sends one GET to a public
// dist-tags document with a bare user-agent — no token, no cookie, no credential,
// nothing about the machine. `void-harness adoption` documents the same stance:
// pull public aggregates, never phone home.
//
// Every failure is a named reason rather than a throw, so a caller can degrade
// honestly (a rate-limit must never read like an unpublished package, and neither
// must ever read like "you are up to date").

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
export const NPM_PACKAGE = 'voidharness';
const DEFAULT_TIMEOUT_MS = 1_500;

/** Only the environment keys npm itself uses. Kept explicit so nothing else leaks in. */
export interface RegistryEnvironment {
  readonly [key: string]: string | undefined;
}

export interface FetchLatestOptions {
  readonly fetchImpl?: typeof fetch;
  readonly registry?: string;
  readonly pkg?: string;
  readonly timeoutMs?: number;
}

export interface LatestVersion {
  readonly latest?: string;
  /** Why no version could be read. Present if and only if `latest` is absent. */
  readonly reason?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== undefined && v !== null && !Array.isArray(v); // allow-null: narrowing an unknown JSON payload at the parse boundary

/** Accept only an https origin we can actually call; anything else falls back to
 * the public default rather than following a hostile or unusable target. */
function safeRegistry(candidate: string | undefined): string | undefined {
  if (candidate === undefined || candidate.trim() === '') return undefined;
  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** The `registry=` line of an .npmrc, ignoring comments and auth lines. */
function registryFromNpmrc(npmrc: string | undefined): string | undefined {
  if (npmrc === undefined) return undefined;
  for (const rawLine of npmrc.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
    const match = /^registry\s*=\s*(.+)$/i.exec(line) ?? undefined;
    if (match !== undefined) return match[1]?.trim();
  }
  return undefined;
}

/** Resolve the registry in npm's own precedence order: environment, then .npmrc,
 * then the public default. An unsafe or unparseable value is discarded, never used. */
export function resolveRegistry(env: RegistryEnvironment, npmrc?: string): string {
  const fromEnv = safeRegistry(env['npm_config_registry'] ?? env['NPM_CONFIG_REGISTRY']);
  if (fromEnv !== undefined) return fromEnv;
  return safeRegistry(registryFromNpmrc(npmrc)) ?? DEFAULT_REGISTRY;
}

/** The dist-tags document is a few bytes; the full package document is megabytes. */
export function distTagsUrl(registry: string, pkg: string): string {
  const name = pkg.trim();
  if (name === '' || name.includes('..') || name.startsWith('/')) {
    throw new Error(`unsafe package name: ${JSON.stringify(pkg)}`);
  }
  return `${registry}/-/package/${encodeURIComponent(name)}/dist-tags`;
}

/** dist-tags payload -> the `latest` tag, or undefined when absent or malformed. */
export function parseLatestTag(json: unknown): string | undefined {
  if (!isRecord(json)) return undefined;
  const latest = json['latest'];
  return typeof latest === 'string' && latest.trim() !== '' ? latest.trim() : undefined;
}

/**
 * Read the published version. Never throws and never blocks past `timeoutMs`:
 * a caller on a session-start path can await this without risking the session.
 */
export async function fetchLatestVersion(options: FetchLatestOptions = {}): Promise<LatestVersion> {
  const {
    fetchImpl = fetch,
    registry = DEFAULT_REGISTRY,
    pkg = NPM_PACKAGE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let url: string;
  try {
    url = distTagsUrl(registry, pkg);
  } catch {
    return { reason: 'unsafe package name' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': 'void-harness' },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) return { reason: `HTTP ${res.status} (rate-limited)` };
      return { reason: `HTTP ${res.status}` };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { reason: 'malformed response' };
    }
    const latest = parseLatestTag(json);
    return latest === undefined ? { reason: 'no usable latest tag in response' } : { latest };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { reason: name === 'AbortError' ? 'timed out' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}
