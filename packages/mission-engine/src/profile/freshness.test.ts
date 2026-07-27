import { describe, expect, it } from 'vitest';
import { profileValue } from '../test/profile.js';
import { assessProfileFreshness } from './freshness.js';
import { type ProfileDocument, parseProfile } from './schema.js';

function profile(overrides: Record<string, unknown> = {}): ProfileDocument {
  const parsed = parseProfile(profileValue(overrides));
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

describe('profile freshness', () => {
  it('keeps reviewed guidance current only while detected versions are covered', () => {
    expect(assessProfileFreshness(
      profile(),
      [{ id: 'typescript', version: '5.9.2', sources: ['package.json:typescript'] }],
      '2026-08-01T00:00:00Z',
    )).toEqual({ status: 'current', reasons: [], sourceReviewRequired: false });
  });

  it('degrades an expired profile and requests source-driven review', () => {
    const result = assessProfileFreshness(
      profile({ reviewedAt: '2025-01-01', expiresAfterDays: 30 }),
      [{ id: 'typescript', version: '5.9.2', sources: ['package.json:typescript'] }],
      '2026-08-01T00:00:00Z',
    );

    expect(result).toEqual({
      status: 'degraded',
      reasons: ['profile-expired'],
      sourceReviewRequired: true,
    });
  });

  it.each([
    ['unknown', null, 'version-unknown:typescript'],
    ['future', '7.0.0', 'version-uncovered:typescript@7.0.0'],
    ['older', '4.9.9', 'version-uncovered:typescript@4.9.9'],
  ])('degrades a %s detected version instead of claiming state of the art', (_label, version, reason) => {
    const result = assessProfileFreshness(
      profile(),
      [{ id: 'typescript', version, sources: ['package.json:typescript'] }],
      '2026-08-01T00:00:00Z',
    );

    expect(result.status).toBe('degraded');
    expect(result.reasons).toContain(reason);
    expect(result.sourceReviewRequired).toBe(true);
  });

  it('checks every applicable project version instead of hiding one behind another', () => {
    const result = assessProfileFreshness(
      profile(),
      [
        { id: 'typescript', version: '5.9.2', sources: ['apps/legacy/package.json:typescript'] },
        { id: 'typescript', version: '7.1.0', sources: ['apps/future/package.json:typescript'] },
      ],
      '2026-08-01T00:00:00Z',
    );

    expect(result).toMatchObject({
      status: 'degraded',
      reasons: ['version-uncovered:typescript@7.1.0'],
      sourceReviewRequired: true,
    });
  });
});
