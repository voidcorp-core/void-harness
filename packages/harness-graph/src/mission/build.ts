import type { MissionPlan } from '@voidcorp/mission-engine';
import { graphEntityId, graphRelationId } from '../model/v3/ids.js';
import { extractedProvenance } from '../model/v3/provenance.js';
import { sealGraphSnapshot } from '../model/v3/schema.js';
import {
  GRAPH_CONTRACT_VERSION,
  type GraphJsonValue,
  type GraphSnapshotV3,
} from '../model/v3/types.js';

function requiredId(ids: ReadonlyMap<string, string>, sourceId: string): string {
  const mapped = ids.get(sourceId);
  if (mapped === undefined) {
    throw new Error(`GRAPH_MISSION_INVALID: missing mapped identity for '${sourceId}'`);
  }
  return mapped;
}

export function buildMissionGraph(plan: MissionPlan): GraphSnapshotV3 {
  const pointer = {
    kind: 'contract' as const,
    ref: `mission-plan:${plan.ticketId}`,
    hashOrVersion: plan.planHash,
  };
  const provenance = extractedProvenance(pointer);
  const ticketId = graphEntityId('mission', 'ticket', plan.ticketId);
  const passIds = new Map(plan.dag.nodes.map((pass) => [
    pass.id,
    graphEntityId('mission', 'pass', pass.id),
  ]));
  const profileIds = new Map(plan.profiles.map((profile) => [
    profile.profileId,
    graphEntityId('mission', 'profile', profile.profileId),
  ]));
  const nodes = [
    {
      id: ticketId,
      kind: 'ticket',
      label: plan.ticketId,
      data: {
        inputHash: plan.inputHash,
        planHash: plan.planHash,
        riskLevel: plan.risk.level,
        requiredMode: plan.risk.requiredMode,
        contextStatus: plan.context.status,
      },
      provenance,
    },
    ...plan.dag.nodes.map((pass) => ({
      id: requiredId(passIds, pass.id),
      kind: 'pass',
      label: pass.id,
      data: {
        initialState: pass.initialState,
        depth: plan.applicability.find((item) => item.pass === pass.id)?.depth ?? 'unknown',
      },
      provenance,
    })),
    ...plan.profiles.map((profile) => ({
      id: requiredId(profileIds, profile.profileId),
      kind: 'profile',
      label: profile.profileId,
      data: {
        state: profile.state,
        profileVersion: profile.profileVersion,
        sourceReviewRequired: profile.sourceReviewRequired,
        activePatternIds: profile.activePatternIds as readonly GraphJsonValue[],
      },
      provenance,
    })),
  ];
  const dependencyEdges = plan.dag.nodes.flatMap((pass) => pass.dependsOn.map((dependency) => {
    const from = requiredId(passIds, pass.id);
    const to = requiredId(passIds, dependency);
    return {
      id: graphRelationId('mission', 'depends-on', [from, to]),
      from,
      to,
      kind: 'depends-on',
      data: {},
      provenance,
    };
  }));
  const profileEdges = plan.profiles.map((profile) => {
    const to = requiredId(profileIds, profile.profileId);
    return {
      id: graphRelationId('mission', 'uses-profile', [ticketId, to]),
      from: ticketId,
      to,
      kind: 'uses-profile',
      data: { state: profile.state },
      provenance,
    };
  });
  return sealGraphSnapshot({
    schemaVersion: 3,
    graphId: graphEntityId('mission', 'graph', plan.ticketId),
    graphType: 'mission',
    source: { kind: 'native', version: GRAPH_CONTRACT_VERSION },
    nodes,
    edges: [...dependencyEdges, ...profileEdges],
    hyperedges: [],
  });
}
