// Pure comparison between the harness version installed in a project and the
// version published on the registry. No I/O, no clock, no network: the whole
// decision is a function of two strings, so every degraded path is testable.
//
// Deliberately stricter than `packages/cli/src/lib/version.ts`: that comparator
// parses loosely (`parseInt` on each dotted segment) which reads `2.2.0-rc.1` as
// `2.2.0` and would announce a false up-to-date. Here an input that is not a
// plain `M.m.p` triple is refused rather than guessed — a wrong "you are current"
// is worse than an honest "cannot tell".

/** What the comparison concluded. `unknown` always carries a reason. */
export type FreshnessVerdict = 'up-to-date' | 'behind' | 'ahead' | 'unknown';

export interface Freshness {
  readonly verdict: FreshnessVerdict;
  readonly installed: string;
  readonly latest?: string;
  /** Why the verdict is `unknown`. Present if and only if the verdict is `unknown`. */
  readonly reason?: string;
}

const SEMVER_TRIPLE = /^(\d{1,10})\.(\d{1,10})\.(\d{1,10})$/;

/** Strip a leading `v` and surrounding whitespace. Ranges (`^`, `~`) are not
 * accepted here: an installed or published version is an exact point, and a
 * range reaching this function means the caller resolved the wrong thing. */
function clean(raw: string): string {
  return raw.trim().replace(/^v/, '');
}

/** Parse a strict `M.m.p` triple, or undefined when the shape is anything else. */
function triple(raw: string): readonly [number, number, number] | undefined {
  const match = SEMVER_TRIPLE.exec(clean(raw)) ?? undefined;
  if (match === undefined) return undefined;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

/** Name the reason a version string could not be compared, for an actionable message. */
function unusable(raw: string): string {
  const value = clean(raw);
  if (value === '') return 'is empty';
  if (value === 'unknown') return 'is unknown';
  if (value.includes('-') || value.includes('+')) {
    return 'is a prerelease or carries build metadata, which is not comparable';
  }
  return 'is not a M.m.p version';
}

/**
 * Compare the installed version against the published one.
 *
 * Returns `unknown` — never `up-to-date` — whenever either side cannot be parsed,
 * so a caller can only ever stay silent or explain itself, never reassure wrongly.
 */
export function compareFreshness(installed: string, latest: string): Freshness {
  const local = triple(installed);
  if (local === undefined) {
    return {
      verdict: 'unknown',
      installed,
      latest,
      reason: `installed version ${unusable(installed)}`,
    };
  }
  const remote = triple(latest);
  if (remote === undefined) {
    return {
      verdict: 'unknown',
      installed,
      latest,
      reason: `published version ${unusable(latest)}`,
    };
  }
  for (let i = 0; i < 3; i += 1) {
    const mine = local[i] ?? 0;
    const theirs = remote[i] ?? 0;
    if (mine !== theirs) {
      return { verdict: mine < theirs ? 'behind' : 'ahead', installed, latest };
    }
  }
  return { verdict: 'up-to-date', installed, latest };
}
