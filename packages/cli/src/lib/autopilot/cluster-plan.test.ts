import { describe, expect, it } from 'vitest';
import {
  type CandidateTicket,
  type ClusterFootprint,
  type ClusterPlanInput,
  planCluster,
} from './cluster-plan.js';

function tk(over: Partial<CandidateTicket> & { id: string }): CandidateTicket {
  return {
    ready: true,
    priority: 2,
    boardOrder: 0,
    blockedByOpen: false,
    dependsOn: [],
    estimate: 5,
    ...over,
  };
}

function fp(over: Partial<ClusterFootprint> & { id: string }): ClusterFootprint {
  return { areas: [`src/${over.id}`], highRisk: false, confidence: 0.9, ...over };
}

function input(over: Partial<ClusterPlanInput> & Pick<ClusterPlanInput, 'tickets'>): ClusterPlanInput {
  return {
    schemaVersion: 1,
    footprints: over.tickets.map((t) => fp({ id: t.id })),
    ...over,
  };
}

function excludedIds(plan: ReturnType<typeof planCluster>, cause: string): readonly string[] {
  return plan.excluded.filter((e) => e.cause === cause).map((e) => e.id);
}

describe('planCluster', () => {
  it('plans an empty cluster from an empty pool', () => {
    const plan = planCluster(input({ tickets: [] }));
    expect(plan.schemaVersion).toBe(1);
    expect(plan.cluster).toEqual([]);
    expect(plan.parallel).toEqual([]);
    expect(plan.sequential).toEqual([]);
    expect(plan.excluded).toEqual([]);
  });

  it('plans a single ticket', () => {
    const plan = planCluster(input({ tickets: [tk({ id: 'A' })] }));
    expect(plan.cluster).toEqual(['A']);
    expect(plan.parallel).toEqual(['A']);
  });

  it('fills the cluster up to four independent tickets', () => {
    const plan = planCluster(
      input({ tickets: [tk({ id: 'A' }), tk({ id: 'B' }), tk({ id: 'C' }), tk({ id: 'D' })] }),
    );
    expect(plan.cluster).toEqual(['A', 'B', 'C', 'D']);
    expect(plan.parallel).toEqual(['A', 'B', 'C', 'D']);
  });

  it('excludes the fifth ticket because four is the ceiling', () => {
    const plan = planCluster(
      input({
        tickets: ['A', 'B', 'C', 'D', 'E'].map((id, i) => tk({ id, boardOrder: i })),
      }),
    );
    expect(plan.cluster).toEqual(['A', 'B', 'C', 'D']);
    expect(excludedIds(plan, 'cluster-full')).toEqual(['E']);
  });

  it('excludes a ticket blocked by an open one', () => {
    const plan = planCluster(input({ tickets: [tk({ id: 'A' }), tk({ id: 'B', blockedByOpen: true })] }));
    expect(plan.cluster).toEqual(['A']);
    expect(excludedIds(plan, 'blocked-by-open')).toEqual(['B']);
  });

  it('excludes a ticket whose tracker state is not ready', () => {
    const plan = planCluster(input({ tickets: [tk({ id: 'A' }), tk({ id: 'B', ready: false })] }));
    expect(excludedIds(plan, 'not-ready')).toEqual(['B']);
  });

  it('excludes a ticket that depends on a selected one because the cluster must carry no implied order', () => {
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A', priority: 1 }), tk({ id: 'B', priority: 2, dependsOn: ['A'] }), tk({ id: 'C', priority: 3 })],
      }),
    );
    expect(plan.cluster).toEqual(['A', 'C']);
    expect(excludedIds(plan, 'dependent-on-selected')).toEqual(['B']);
  });

  it('selects by priority then board order', () => {
    const plan = planCluster(
      input({
        tickets: [
          tk({ id: 'low', priority: 4, boardOrder: 0 }),
          tk({ id: 'urgent', priority: 1, boardOrder: 9 }),
          tk({ id: 'none', priority: 0, boardOrder: 0 }),
        ],
      }),
    );
    expect(plan.cluster).toEqual(['urgent', 'low', 'none']);
  });

  it('sequences a ticket sharing an area with another, naming the overlap', () => {
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A' }), tk({ id: 'B' })],
        footprints: [fp({ id: 'A', areas: ['src/auth'] }), fp({ id: 'B', areas: ['src/auth'] })],
      }),
    );
    expect(plan.parallel).toEqual([]);
    expect(plan.sequential).toEqual([
      { id: 'A', reasons: ['footprint-overlap'] },
      { id: 'B', reasons: ['footprint-overlap'] },
    ]);
  });

  it('sequences a high-risk ticket because a lockfile or a migration always collides', () => {
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A' }), tk({ id: 'B' })],
        footprints: [fp({ id: 'A', highRisk: true }), fp({ id: 'B' })],
      }),
    );
    expect(plan.parallel).toEqual(['B']);
    expect(plan.sequential).toEqual([{ id: 'A', reasons: ['high-risk'] }]);
  });

  it('sequences a low-confidence footprint because a guess must not fan out', () => {
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A' }), tk({ id: 'B' })],
        footprints: [fp({ id: 'A', confidence: 0.2 }), fp({ id: 'B' })],
      }),
    );
    expect(plan.parallel).toEqual(['B']);
    expect(plan.sequential).toEqual([{ id: 'A', reasons: ['low-confidence'] }]);
  });

  it('ignores an excluded ticket when judging overlap because it never joins the run', () => {
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A' }), tk({ id: 'B', blockedByOpen: true })],
        footprints: [fp({ id: 'A', areas: ['src/auth'] }), fp({ id: 'B', areas: ['src/auth'] })],
      }),
    );
    expect(plan.parallel).toEqual(['A']);
    expect(plan.sequential).toEqual([]);
  });

  it('shrinks the cluster when the review budget runs out', () => {
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A' }), tk({ id: 'B' }), tk({ id: 'C' })],
        footprints: [
          fp({ id: 'A', highRisk: true }),
          fp({ id: 'B', confidence: 0.2 }),
          fp({ id: 'C' }),
        ],
      }),
    );
    expect(plan.cluster).toEqual(['A']);
    expect(excludedIds(plan, 'review-budget-exhausted')).toEqual(['B', 'C']);
  });

  it('reports the totalled tracker estimate without letting it exclude anything', () => {
    const plan = planCluster(
      input({ tickets: ['A', 'B', 'C', 'D'].map((id) => tk({ id, estimate: 5 })) }),
    );
    expect(plan.reviewBudget.totalEstimate).toBe(20);
    expect(plan.cluster).toEqual(['A', 'B', 'C', 'D']);
  });

  it('excludes a ticket whose footprint was never estimated rather than inventing an empty one', () => {
    const plan = planCluster({
      schemaVersion: 1,
      tickets: [tk({ id: 'A' }), tk({ id: 'B' })],
      footprints: [fp({ id: 'A' })],
    });
    expect(excludedIds(plan, 'missing-footprint')).toEqual(['B']);
    expect(plan.cluster).toEqual(['A']);
  });

  it('excludes a footprint that names no area, the same silence as no entry at all', () => {
    // An entry declaring `areas: []` and no entry at all are one state written
    // two ways: nobody knows what the ticket touches. Admitting one and refusing
    // the other is what put an undeclarable ticket in front of the
    // reconciliation audit, which then refused the whole cluster after both
    // workers had finished. `orderWorkers` already reads the two spellings as
    // the same `unknown-footprint`; this is the reader that disagreed.
    const plan = planCluster(
      input({
        tickets: [tk({ id: 'A' }), tk({ id: 'B' })],
        footprints: [fp({ id: 'A' }), fp({ id: 'B', areas: [] })],
      }),
    );
    expect(excludedIds(plan, 'missing-footprint')).toEqual(['B']);
    expect(plan.cluster).toEqual(['A']);
    expect(plan.sequential).toEqual([]);
  });

  it('excludes an unnamed footprint even alone, because a missing one is refused alone too', () => {
    // Not a rule about neighbours. Autopilot routes on footprints, and a ticket
    // that names no ground gives it nothing to route on; the human runs it
    // through `void-implement` directly, or declares its areas.
    const plan = planCluster(
      input({ tickets: [tk({ id: 'A' })], footprints: [fp({ id: 'A', areas: [] })] }),
    );
    expect(plan.cluster).toEqual([]);
    expect(excludedIds(plan, 'missing-footprint')).toEqual(['A']);
  });

  it('excludes a malformed ticket with a typed cause instead of throwing', () => {
    const plan = planCluster({
      schemaVersion: 1,
      tickets: [tk({ id: 'A' }), tk({ id: '  ' }), tk({ id: 'C', priority: Number.NaN })],
      footprints: [fp({ id: 'A' }), fp({ id: '  ' }), fp({ id: 'C' })],
    });
    expect(plan.cluster).toEqual(['A']);
    expect(plan.excluded.filter((e) => e.cause === 'malformed-input')).toHaveLength(2);
  });

  it('excludes a duplicated ticket id because a cluster cannot claim the same work twice', () => {
    const plan = planCluster({
      schemaVersion: 1,
      tickets: [tk({ id: 'A' }), tk({ id: 'A' })],
      footprints: [fp({ id: 'A' })],
    });
    expect(plan.cluster).toEqual(['A']);
    expect(excludedIds(plan, 'malformed-input')).toEqual(['A']);
  });

  it('excludes a malformed footprint rather than trusting an out-of-range confidence', () => {
    const plan = planCluster({
      schemaVersion: 1,
      tickets: [tk({ id: 'A' }), tk({ id: 'B' })],
      footprints: [fp({ id: 'A' }), fp({ id: 'B', confidence: 1.4 })],
    });
    expect(excludedIds(plan, 'malformed-input')).toEqual(['B']);
  });

  it('honours a tightened cluster size', () => {
    const plan = planCluster(
      input({ tickets: [tk({ id: 'A' }), tk({ id: 'B' })], clusterSize: 1 }),
    );
    expect(plan.cluster).toEqual(['A']);
    expect(excludedIds(plan, 'cluster-full')).toEqual(['B']);
  });

  it('rejects a cluster size outside 1..4 because the ceiling is part of the contract', () => {
    expect(() => planCluster(input({ tickets: [], clusterSize: 5 }))).toThrow(/clusterSize/);
    expect(() => planCluster(input({ tickets: [], clusterSize: 0 }))).toThrow(/clusterSize/);
  });

  it('rejects an unknown input schema version instead of guessing the shape', () => {
    expect(() =>
      planCluster({ schemaVersion: 2 as unknown as 1, tickets: [], footprints: [] }),
    ).toThrow(/schemaVersion/);
  });
});
