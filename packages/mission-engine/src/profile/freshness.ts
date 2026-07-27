import {
  compareProfileVersions,
  type ProfileDocument,
} from './schema.js';

export interface DetectedTechnology {
  readonly id: string;
  readonly version: string | null;
  readonly sources: readonly string[];
}

export interface ProfileFreshnessAssessment {
  readonly status: 'current' | 'degraded';
  readonly reasons: readonly string[];
  readonly sourceReviewRequired: boolean;
}

export function assessProfileFreshness(
  profile: ProfileDocument,
  detected: readonly DetectedTechnology[],
  now: string,
): ProfileFreshnessAssessment {
  const reasons: string[] = [];
  const reviewed = Date.parse(`${profile.reviewedAt}T00:00:00Z`);
  const current = Date.parse(now);
  if (!Number.isFinite(current)) throw new Error('PROFILE_NOW_INVALID: expected an ISO timestamp');
  const expires = reviewed + profile.expiresAfterDays * 24 * 60 * 60 * 1_000;
  if (current > expires) reasons.push('profile-expired');

  for (const range of profile.technologies) {
    for (const technology of detected.filter((item) => item.id === range.id)) {
      if (technology.version === null) {
        reasons.push(`version-unknown:${range.id}`);
        continue;
      }
      let covered = false;
      try {
        covered = compareProfileVersions(technology.version, range.minimumVersion) >= 0
          && compareProfileVersions(technology.version, range.maximumVersionExclusive) < 0;
      } catch {
        reasons.push(`version-unknown:${range.id}`);
        continue;
      }
      if (!covered) reasons.push(`version-uncovered:${range.id}@${technology.version}`);
    }
  }
  const uniqueReasons = Object.freeze([...new Set(reasons)].sort());
  return Object.freeze({
    status: uniqueReasons.length === 0 ? 'current' : 'degraded',
    reasons: uniqueReasons,
    sourceReviewRequired: uniqueReasons.length > 0,
  });
}
