import type { MissionPlan } from '@voidcorp/mission-engine';
import { describe, expect, it } from 'vitest';
import { buildMissionGraph } from './build.js';

describe('MissionGraph v3 builder', () => {
  it('projects the canonical mission DAG with stable dependency edges', () => {
    const plan = {
      schemaVersion: 1,
      generatedAt: '2026-07-27T00:00:00Z',
      inputHash: `sha256:${'1'.repeat(64)}`,
      planHash: `sha256:${'2'.repeat(64)}`,
      ticketId: 'DEV-434',
      policySources: [],
      policyWaivers: [],
      context: { status: 'complete', issues: [] },
      risk: { level: 'medium', requiredMode: 'team', matchedPredicates: [], reasons: [] },
      applicability: [],
      profiles: [],
      dag: {
        schemaVersion: 1,
        nodes: [
          { id: 'architecture', dependsOn: [], initialState: 'pending' },
          { id: 'tdd', dependsOn: ['architecture'], initialState: 'pending' },
        ],
      },
    } as unknown as MissionPlan;

    const graph = buildMissionGraph(plan);

    expect(graph).toMatchObject({ schemaVersion: 3, graphType: 'mission' });
    expect(graph.nodes.map((node) => node.kind)).toEqual(['pass', 'pass', 'ticket']);
    expect(graph.edges).toHaveLength(1);
  });
});
