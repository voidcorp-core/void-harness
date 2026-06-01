// Minimal semver comparison for void-harness. Plugin versions in this
// marketplace are M.m.p with optional leading ^/~ in declared ranges, so a
// full semver parser would be overkill. Pre-release tags and metadata are
// intentionally unsupported — if we adopt them, swap this for `semver`.

export function normalizeVersion(v: string): string {
  return v.replace(/^[~^=v\s]+/, '').trim();
}

export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai < bi ? -1 : 1;
  }
  return 0;
}
