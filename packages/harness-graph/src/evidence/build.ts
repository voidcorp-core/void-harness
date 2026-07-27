import type { Evidence, MissionVerdict } from '@voidcorp/mission-engine';
import { graphEntityId, graphRelationId } from '../model/v3/ids.js';
import { observedProvenance } from '../model/v3/provenance.js';
import { sealGraphSnapshot } from '../model/v3/schema.js';
import {
  GRAPH_CONTRACT_VERSION,
  type GraphNodeV3,
  type GraphSnapshotV3,
} from '../model/v3/types.js';

export interface EvidenceGraphInput {
  readonly missionId: string;
  readonly evidence: readonly Evidence[];
  readonly verdict?: MissionVerdict;
}

function confidence(value: Evidence['confidence']): number {
  if (value === 'high') return 1;
  if (value === 'medium') return 0.67;
  return 0.34;
}

export function buildEvidenceGraph(input: EvidenceGraphInput): GraphSnapshotV3 {
  if (input.verdict !== undefined && input.verdict.missionId !== input.missionId) {
    throw new Error('EVIDENCE_GRAPH_INVALID: verdict belongs to another mission');
  }
  const evidence = [...input.evidence].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId));
  const missionNodeId = graphEntityId('evidence', 'mission', input.missionId);
  const nodes = new Map<string, GraphNodeV3>();
  const edges = [];
  const missionProvenance = evidence[0] === undefined
    ? undefined
    : observedProvenance({
        kind: 'event',
        ref: evidence[0].evidenceId,
        hashOrVersion: evidence[0].proofHash,
      }, evidence[0].finishedAt, confidence(evidence[0].confidence));
  if (missionProvenance !== undefined) {
    nodes.set(missionNodeId, {
      id: missionNodeId,
      kind: 'mission',
      label: input.missionId,
      data: {},
      provenance: missionProvenance,
    });
  }

  for (const proof of evidence) {
    if (proof.missionId !== input.missionId) {
      throw new Error(`EVIDENCE_GRAPH_INVALID: evidence '${proof.evidenceId}' belongs to another mission`);
    }
    const provenance = observedProvenance({
      kind: 'event',
      ref: proof.evidenceId,
      hashOrVersion: proof.proofHash,
    }, proof.finishedAt, confidence(proof.confidence));
    const proofNodeId = graphEntityId('evidence', 'proof', proof.evidenceId);
    nodes.set(proofNodeId, {
      id: proofNodeId,
      kind: 'evidence',
      label: proof.evidenceId,
      data: {
        status: proof.status,
        producer: proof.producer,
        source: proof.source,
        inputHash: proof.inputHash,
        diffHash: proof.diffHash,
        durationMs: proof.durationMs,
        exitCode: proof.exitCode,
      },
      provenance,
    });
    edges.push({
      id: graphRelationId('evidence', 'proves', [proofNodeId, missionNodeId]),
      from: proofNodeId,
      to: missionNodeId,
      kind: 'proves',
      data: {},
      provenance,
    });
    for (const affected of proof.affectedNodes) {
      const affectedId = graphEntityId('evidence', 'affected', affected);
      if (!nodes.has(affectedId)) nodes.set(affectedId, {
        id: affectedId,
        kind: 'affected-node',
        label: affected,
        data: { targetId: affected },
        provenance,
      });
      edges.push({
        id: graphRelationId('evidence', 'affects', [proofNodeId, affectedId]),
        from: proofNodeId,
        to: affectedId,
        kind: 'affects',
        data: {},
        provenance,
      });
    }
    for (const dependency of proof.dependencies) {
      const dependencyId = graphEntityId(
        'evidence',
        'dependency',
        `${dependency.kind}:${dependency.key}:${dependency.hash}`,
      );
      if (!nodes.has(dependencyId)) nodes.set(dependencyId, {
        id: dependencyId,
        kind: 'dependency',
        label: `${dependency.kind}:${dependency.key}`,
        data: {
          dependencyKind: dependency.kind,
          key: dependency.key,
          hash: dependency.hash,
        },
        provenance,
      });
      edges.push({
        id: graphRelationId('evidence', 'depends-on', [proofNodeId, dependencyId]),
        from: proofNodeId,
        to: dependencyId,
        kind: 'depends-on',
        data: {},
        provenance,
      });
    }
  }

  if (input.verdict !== undefined) {
    const observed = [...evidence].sort((left, right) =>
      left.finishedAt.localeCompare(right.finishedAt)
      || left.evidenceId.localeCompare(right.evidenceId)).at(-1);
    if (observed === undefined) throw new Error('EVIDENCE_GRAPH_INVALID: a verdict requires evidence');
    const provenance = observedProvenance({
      kind: 'contract',
      ref: `verdict:${input.verdict.missionId}`,
      hashOrVersion: 'mission-verdict-v1',
    }, observed.finishedAt, 1);
    const verdictId = graphEntityId('evidence', 'verdict', input.verdict.missionId);
    nodes.set(verdictId, {
      id: verdictId,
      kind: 'verdict',
      label: input.verdict.status,
      data: { status: input.verdict.status },
      provenance,
    });
    for (const proof of evidence) {
      const proofId = graphEntityId('evidence', 'proof', proof.evidenceId);
      edges.push({
        id: graphRelationId('evidence', 'supports', [proofId, verdictId]),
        from: proofId,
        to: verdictId,
        kind: 'supports',
        data: { proofStatus: proof.status },
        provenance,
      });
    }
  }

  return sealGraphSnapshot({
    schemaVersion: 3,
    graphId: graphEntityId('evidence', 'graph', input.missionId),
    graphType: 'evidence',
    source: { kind: 'native', version: GRAPH_CONTRACT_VERSION },
    nodes: [...nodes.values()],
    edges,
    hyperedges: [],
  });
}
