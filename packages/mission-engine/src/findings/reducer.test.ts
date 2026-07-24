import { describe, expect, it } from 'vitest';
import { event } from '../test/events.js';
import { reduceFindings } from './reducer.js';

describe('finding ledger', () => {
  it('resolves a finding through append-only events', () => {
    const state = reduceFindings([
      event({
        kind: 'finding.reported',
        payload: {
          findingId: 'fnd_authz-gap',
          ruleId: 'security.authz',
          severity: 'high',
          title: 'Tenant boundary is not enforced',
          blocking: true,
          waivable: true,
          evidenceIds: [],
        },
      }),
      event({
        seq: 2,
        eventId: 'evt_00000000-0000-4000-8000-000000000002',
        kind: 'finding.resolved',
        payload: {
          findingId: 'fnd_authz-gap',
          resolution: 'Policy test now covers the boundary',
        },
      }),
    ]);

    expect(state.findings).toMatchObject([
      { findingId: 'fnd_authz-gap', status: 'resolved' },
    ]);
    expect(state.issues).toEqual([]);
  });

  it('refuses to except a non-waivable blocker', () => {
    const state = reduceFindings([
      event({
        kind: 'finding.reported',
        payload: {
          findingId: 'fnd_secret-leak',
          ruleId: 'security.secret-leak',
          severity: 'critical',
          title: 'A secret is present in the artifact',
          blocking: true,
          waivable: false,
          evidenceIds: [],
        },
      }),
      event({
        seq: 2,
        eventId: 'evt_00000000-0000-4000-8000-000000000002',
        kind: 'finding.exception.granted',
        payload: {
          findingId: 'fnd_secret-leak',
          actor: 'maintainer',
          reason: 'ship anyway',
        },
      }),
    ]);

    expect(state.findings[0]).toMatchObject({
      findingId: 'fnd_secret-leak',
      status: 'open',
    });
    expect(state.issues).toContainEqual({
      code: 'non-waivable-exception',
      findingId: 'fnd_secret-leak',
    });
  });

  it('normalizes high and critical findings to blocking', () => {
    const state = reduceFindings([
      event({
        kind: 'finding.reported',
        payload: {
          findingId: 'fnd_critical',
          ruleId: 'security.critical',
          severity: 'critical',
          title: 'Critical issue',
          blocking: false,
          waivable: true,
          evidenceIds: [],
        },
      }),
    ]);

    expect(state.findings[0]).toMatchObject({ blocking: true, status: 'open' });
  });
});
