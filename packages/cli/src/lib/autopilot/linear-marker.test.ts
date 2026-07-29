import { describe, expect, it } from 'vitest';
import {
  isExpired,
  type LeaseMarker,
  MARKER_BEGIN,
  MARKER_END,
  parseLeaseMarker,
  renderLeaseMarker,
} from './linear-marker.js';

const MARKER: LeaseMarker = {
  schemaVersion: 1,
  programId: 'void-harness-v3',
  runId: 'run-2026-07-29-a',
  clusterId: 'cluster-7f3a',
  baseBranch: 'main',
  baseSha: '2b0e24dc054cf4b7bde36d2e346db341f31501a5',
  integrationBranch: 'autopilot/cluster-7f3a',
  expiresAt: '2026-07-29T18:00:00.000Z',
};

describe('renderLeaseMarker', () => {
  it('round-trips through its own parser', () => {
    expect(parseLeaseMarker(renderLeaseMarker(MARKER))).toEqual(MARKER);
  });

  it('delimits the marker so a human comment can surround it', () => {
    const rendered = renderLeaseMarker(MARKER);

    expect(rendered).toContain(MARKER_BEGIN);
    expect(rendered).toContain(MARKER_END);
    expect(parseLeaseMarker(`Taking this one.\n\n${rendered}\n\nBack later.`)).toEqual(MARKER);
  });

  it('stays small enough to never dominate a ticket thread', () => {
    expect(renderLeaseMarker(MARKER).length).toBeLessThan(1000);
  });

  it('refuses to render an identifier that is not a slug because markers carry no free text', () => {
    expect(() => renderLeaseMarker({ ...MARKER, clusterId: 'cluster 7f3a; DROP' })).toThrow(/clusterId/);
    expect(() => renderLeaseMarker({ ...MARKER, programId: '' })).toThrow(/programId/);
  });

  it('refuses an identifier walking up out of its directory', () => {
    // These become branch names and worktree path segments downstream.
    expect(() => renderLeaseMarker({ ...MARKER, integrationBranch: 'autopilot/../../etc' })).toThrow(
      /integrationBranch/,
    );
  });

  it('refuses a base sha that is not a commit id', () => {
    expect(() => renderLeaseMarker({ ...MARKER, baseSha: 'HEAD~1' })).toThrow(/baseSha/);
  });

  it('refuses an expiry that is not an ISO instant', () => {
    expect(() => renderLeaseMarker({ ...MARKER, expiresAt: 'tomorrow' })).toThrow(/expiresAt/);
  });
});

describe('parseLeaseMarker', () => {
  it('returns undefined for a comment carrying no marker', () => {
    expect(parseLeaseMarker('looks good to me')).toBeUndefined();
    expect(parseLeaseMarker('')).toBeUndefined();
  });

  it('returns undefined for a truncated marker rather than a partial lease', () => {
    const rendered = renderLeaseMarker(MARKER);
    expect(parseLeaseMarker(rendered.slice(0, rendered.length - 20))).toBeUndefined();
  });

  it('returns undefined when the payload is not JSON', () => {
    expect(parseLeaseMarker(`${MARKER_BEGIN}\nnot json\n${MARKER_END}`)).toBeUndefined();
  });

  it('returns undefined for an unknown marker schema rather than guessing its fields', () => {
    const rendered = renderLeaseMarker(MARKER).replace('"schemaVersion": 1', '"schemaVersion": 2');
    expect(parseLeaseMarker(rendered)).toBeUndefined();
  });

  it('returns undefined when a required field is missing', () => {
    const rendered = renderLeaseMarker(MARKER).replace(/\s*"clusterId": "[^"]*",/, '');
    expect(parseLeaseMarker(rendered)).toBeUndefined();
  });

  it('returns undefined when an identifier was tampered into free text', () => {
    const rendered = renderLeaseMarker(MARKER).replace('cluster-7f3a"', 'cluster 7f3a"');
    expect(parseLeaseMarker(rendered)).toBeUndefined();
  });

  it('ignores an oversized comment because a marker is bounded by construction', () => {
    const padded = `${'x'.repeat(200_000)}\n${renderLeaseMarker(MARKER)}`;
    expect(parseLeaseMarker(padded)).toBeUndefined();
  });

  it('reads the first marker when a thread accumulated several', () => {
    const second = renderLeaseMarker({ ...MARKER, runId: 'run-later' });
    expect(parseLeaseMarker(`${renderLeaseMarker(MARKER)}\n${second}`)?.runId).toBe('run-2026-07-29-a');
  });
});

describe('isExpired', () => {
  it('treats a lease as live before its expiry', () => {
    expect(isExpired(MARKER, '2026-07-29T17:59:59.000Z')).toBe(false);
  });

  it('treats a lease as expired at and after its expiry', () => {
    expect(isExpired(MARKER, '2026-07-29T18:00:00.000Z')).toBe(true);
    expect(isExpired(MARKER, '2026-07-30T00:00:00.000Z')).toBe(true);
  });

  it('treats an unreadable clock as expired because a lease must fail closed', () => {
    expect(isExpired(MARKER, 'not a date')).toBe(true);
  });
});
