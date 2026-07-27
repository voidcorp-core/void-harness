import { describe, expect, it } from 'vitest';
import { profileValue } from '../test/profile.js';
import { parseProfile } from './schema.js';

describe('profile schema', () => {
  it('accepts a bounded declarative profile with official sources and freshness metadata', () => {
    const parsed = parseProfile(profileValue());

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        id: 'core:typescript',
        reviewedAt: '2026-07-27',
        expiresAfterDays: 180,
      },
    });
  });

  it.each([
    ['executable detector', profileValue({ detectors: { command: 'node detect.js' } })],
    ['unsafe file selector', profileValue({
      detectors: {
        always: false,
        technologies: ['typescript'],
        files: { extensions: [], names: ['../package.json'], pathSegments: [] },
      },
    })],
    ['non-HTTPS source', profileValue({
      sources: [{ title: 'Mirror', url: 'http://example.com/typescript' }],
    })],
    ['invalid version range', profileValue({
      technologies: [{
        id: 'typescript',
        minimumVersion: '7.0.0',
        maximumVersionExclusive: '5.0.0',
      }],
    })],
    ['impossible review date', profileValue({ reviewedAt: '2026-02-31' })],
    ['duplicate pattern identity', profileValue({
      patterns: [
        {
          id: 'typed-source',
          appliesWhen: {
            technologies: ['typescript'],
            files: { extensions: ['.ts'], names: [], pathSegments: [] },
          },
          guidance: 'First bounded guidance statement.',
        },
        {
          id: 'typed-source',
          appliesWhen: {
            technologies: ['typescript'],
            files: { extensions: ['.tsx'], names: [], pathSegments: [] },
          },
          guidance: 'Second bounded guidance statement.',
        },
      ],
    })],
  ])('rejects %s instead of executing or guessing', (_label, value) => {
    expect(parseProfile(value)).toMatchObject({ ok: false });
  });

  it('rejects unknown fields and oversized catalogs fail closed', () => {
    expect(parseProfile(profileValue({ surprise: true }))).toMatchObject({ ok: false });
    expect(parseProfile(profileValue({
      invariants: Array.from({ length: 65 }, (_, index) => `Invariant ${index}`),
    }))).toMatchObject({ ok: false });
  });
});
