// Orchestration: cache, then registry, then the pure comparison — plus the one
// user-facing sentence that comes out of it.
//
// Two rules shape this file. A lookup that failed is never cached, so a tunnel or
// a rate-limit costs one retry rather than a day of silence. And the notice is
// only ever emitted for an install this command can actually update: advising
// `void-harness update` to someone who installed through the marketplace would be
// a confidently wrong instruction.

import { compareFreshness, type Freshness } from './compare.js';
import { readFreshnessCache, writeFreshnessCache, type CacheEnvironment } from './cache.js';
import { fetchLatestVersion, resolveRegistry } from './registry.js';
import { readNpmrc } from './npmrc.js';

/** Where the harness in this project came from, as recorded in the install receipt. */
export type InstallSource = 'local' | 'marketplace';

export interface ResolveFreshnessOptions {
  readonly installed: string;
  readonly env: CacheEnvironment;
  readonly now: number;
  readonly fetchImpl?: typeof fetch;
  /** Contents of a resolved .npmrc. Read from disk when omitted. */
  readonly npmrc?: string;
  /** Directory whose `.npmrc` is consulted; defaults to the current working directory. */
  readonly cwd?: string;
  /** Set false on a path that must never wait on the network; the cache alone answers. */
  readonly allowNetwork?: boolean;
  readonly timeoutMs?: number;
}

/**
 * The freshness of the installed harness, from cache when possible.
 *
 * Never throws. Returns `unknown` with a reason whenever the published version
 * cannot be established — the caller is then expected to stay quiet, not to guess.
 */
export async function resolveFreshness(options: ResolveFreshnessOptions): Promise<Freshness> {
  const { installed, env, now, fetchImpl, npmrc, cwd, allowNetwork = true, timeoutMs } = options;

  const cached = readFreshnessCache(env, now);
  if (cached !== undefined) return compareFreshness(installed, cached.latest);

  if (!allowNetwork) {
    return { verdict: 'unknown', installed, reason: 'no fresh cached version and network lookups are disabled' };
  }

  // Spread the optional members rather than passing them as undefined:
  // `exactOptionalPropertyTypes` treats an explicit undefined as a real value.
  const resolvedNpmrc = npmrc ?? readNpmrc(cwd ?? process.cwd(), env);
  const { latest, reason } = await fetchLatestVersion({
    registry: resolveRegistry(env, resolvedNpmrc),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  if (latest === undefined) {
    return { verdict: 'unknown', installed, reason: reason ?? 'could not read the published version' };
  }

  await writeFreshnessCache(env, { latest, checkedAt: now });
  return compareFreshness(installed, latest);
}

/**
 * The one-line notice to show, or undefined to stay silent.
 *
 * Silence is the default: only a `behind` verdict on an install this CLI owns
 * produces text. Everything else — current, ahead, undetermined, marketplace,
 * unknown source — says nothing at all.
 */
export function freshnessNotice(freshness: Freshness, source: InstallSource | undefined): string | undefined {
  if (freshness.verdict !== 'behind' || source !== 'local') return undefined;
  const { installed, latest } = freshness;
  return `void-harness ${installed} is installed; ${latest ?? 'a newer version'} is published. Run \`void-harness update\` to upgrade.`;
}

/**
 * The same fact, worded for the one surface that can reach a person.
 *
 * A SessionStart hook cannot write to the user: `additionalContext` is read by
 * the model alone, `systemMessage` is discarded for that event, and
 * `terminalSequence` carries escape codes rather than prose. The agent's reply is
 * the only channel left, so the line asks for the relay instead of assuming it.
 *
 * Bounded to once per session on purpose. A standing notice repeated every turn
 * is how a real one stops being read.
 *
 * Silence follows exactly the same rules as `freshnessNotice`, marketplace and
 * unknown sources included -- naming a command that cannot update that install
 * would be confidently wrong however it is worded.
 */
export function freshnessRelay(freshness: Freshness, source: InstallSource | undefined): string | undefined {
  if (freshness.verdict !== 'behind' || source !== 'local') return undefined;
  const { installed, latest } = freshness;
  return `A newer harness is published: ${installed} is installed, ${latest ?? 'a newer version'} is available. `
    + 'Tell the user this once, near the start of your first reply, and name the command that installs it: '
    + '`void-harness update`. Do not repeat it later in the session.';
}
