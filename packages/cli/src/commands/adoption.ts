// `void-harness adoption` — tier-1 adoption telemetry: PULL public npm + GitHub stats. Zero
// phone-home (nothing on a user's machine reports anything; this maintainer command fetches public
// aggregates). Answers "who downloads" without any opt-in or account. See DECISIONS.md (2026-07-21).

import { banner, blank, c, footer, line } from '../lib/render.js';

export const NPM_PKG = '@voidcorp/harness';
export const GH_REPO = 'voidcorp-core/void-harness';

export const npmDownloadsUrl = (pkg: string = NPM_PKG): string => `https://api.npmjs.org/downloads/point/last-month/${pkg}`;
export const githubRepoUrl = (repo: string = GH_REPO): string => `https://api.github.com/repos/${repo}`;
export const githubReleasesUrl = (repo: string = GH_REPO): string => `https://api.github.com/repos/${repo}/releases`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && !!v && !Array.isArray(v);

/** npm downloads-point response -> the download count, or undefined when absent/malformed. */
export function parseNpmDownloads(json: unknown): number | undefined {
  if (!isRecord(json) || typeof json.downloads !== 'number' || !Number.isFinite(json.downloads)) return undefined;
  return json.downloads;
}

/** GitHub repo response -> stargazers_count, or undefined. */
export function parseGithubStars(json: unknown): number | undefined {
  if (!isRecord(json) || typeof json.stargazers_count !== 'number' || !Number.isFinite(json.stargazers_count)) return undefined;
  return json.stargazers_count;
}

/** GitHub releases response -> total asset download_count across all releases, or undefined when the
 * shape is not the expected array of releases-with-assets. An empty release list is a real 0. */
export function parseReleaseDownloads(json: unknown): number | undefined {
  if (!Array.isArray(json)) return undefined;
  let total = 0;
  for (const rel of json) {
    if (!isRecord(rel) || !Array.isArray(rel.assets)) continue;
    for (const asset of rel.assets) {
      if (isRecord(asset) && typeof asset.download_count === 'number' && Number.isFinite(asset.download_count)) {
        total += asset.download_count;
      }
    }
  }
  return total;
}

/** Result of a stat fetch: the parsed JSON, or a specific reason it is unavailable — so a rate-limit
 * (HTTP 403/429) never reads identically to a not-yet-published 404 or an offline network error. */
interface Fetched {
  readonly json?: unknown;
  readonly reason?: string;
}

async function fetchJson(url: string): Promise<Fetched> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': 'void-harness' } });
  } catch {
    return { reason: 'network error' };
  }
  if (!res.ok) return { reason: res.status === 403 || res.status === 429 ? `HTTP ${res.status} (rate-limited)` : res.status === 404 ? 'HTTP 404 (not yet published)' : `HTTP ${res.status}` };
  try {
    return { json: await res.json() };
  } catch {
    return { reason: 'malformed response' };
  }
}

export async function adoption(_args: readonly string[]): Promise<void> {
  banner('void adoption');
  blank();
  const [npm, repo, releases] = await Promise.all([
    fetchJson(npmDownloadsUrl()),
    fetchJson(githubRepoUrl()),
    fetchJson(githubReleasesUrl()),
  ]);
  const render = (f: Fetched, parse: (j: unknown) => number | undefined): string => {
    if (f.reason) return c.dim(`—  (${f.reason})`);
    const n = parse(f.json);
    return n === undefined ? c.dim('—  (no data)') : String(n);
  };
  line(`  npm downloads (last month)   ${render(npm, parseNpmDownloads)}`);
  line(`  GitHub stars                 ${render(repo, parseGithubStars)}`);
  line(`  release asset downloads      ${render(releases, parseReleaseDownloads)}`);
  blank();
  footer(c.dim('tier-1 adoption: pulled from public npm + GitHub APIs, zero phone-home'));
}
