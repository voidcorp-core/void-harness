// Freshness cache — deliberately OUTSIDE the consumer project.
//
// A version check is a property of the installation, not of the repository being
// worked on, so writing it under the project's `.void/` would drop a runtime
// artifact into someone else's git tree and rely on them gitignoring it. It lives
// in the user cache directory instead (XDG_CACHE_HOME, else ~/.cache), which also
// means several projects sharing one install share one registry round-trip.
//
// The file holds the published version and when it was read. Nothing about the
// machine, the project, or the user is ever written here.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One day: long enough that a session start almost never pays for the network,
 * short enough that a release is noticed the next day without any action. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheEnvironment {
  readonly [key: string]: string | undefined;
}

export interface FreshnessCacheEntry {
  readonly latest: string;
  /** Epoch milliseconds at which the registry was read. */
  readonly checkedAt: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v); // allow-null: narrowing an unknown JSON payload at the parse boundary

/** Absolute path of the cache file, or undefined when no home can be resolved
 * (a locked-down CI container, for instance) — in which case caching is simply off. */
export function cacheFilePath(env: CacheEnvironment): string | undefined {
  const xdg = env['XDG_CACHE_HOME']?.trim();
  const home = env['HOME']?.trim();
  const base = xdg !== undefined && xdg !== '' ? xdg : home !== undefined && home !== '' ? join(home, '.cache') : undefined;
  return base === undefined ? undefined : join(base, 'void-harness', 'freshness.json');
}

function parseEntry(raw: string): FreshnessCacheEntry | undefined {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(json)) return undefined;
  const { latest, checkedAt } = json;
  if (typeof latest !== 'string' || latest.trim() === '') return undefined;
  if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) return undefined;
  return { latest, checkedAt };
}

/**
 * The cached published version when it is still fresh at `now`, else undefined.
 *
 * An entry stamped in the future is discarded rather than trusted: a skewed clock
 * must not be able to pin a stale answer indefinitely. Synchronous on purpose —
 * this runs on the session-start path, where a few bytes read beats an await.
 */
export function readFreshnessCache(env: CacheEnvironment, now: number): FreshnessCacheEntry | undefined {
  const path = cacheFilePath(env);
  if (path === undefined) return undefined;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  const entry = parseEntry(raw);
  if (entry === undefined) return undefined;
  const age = now - entry.checkedAt;
  return age >= 0 && age <= CACHE_TTL_MS ? entry : undefined;
}

/**
 * Replace the cached entry. Writes to a temporary sibling then renames, so a
 * concurrent reader sees either the old file or the new one, never a partial one.
 * Never throws: a cache that cannot be written only costs a future round-trip.
 */
export async function writeFreshnessCache(
  env: CacheEnvironment,
  entry: FreshnessCacheEntry,
): Promise<undefined> {
  const path = cacheFilePath(env);
  if (path === undefined) return undefined;
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify({ latest: entry.latest, checkedAt: entry.checkedAt }), 'utf8');
    renameSync(tmp, path);
  } catch {
    // A read-only or full cache directory is not an error worth surfacing.
  }
  return undefined;
}
