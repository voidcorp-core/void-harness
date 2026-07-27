import { describe, expect, it } from 'vitest';
import { replayEventLog, serializeEvent } from '../events/index.js';
import type { CanonicalEvent } from '../events/types.js';
import { event } from '../test/events.js';
import {
  planMissionRecovery,
  type RecoveryNode,
} from './recovery.js';

const SECURITY_NODE: RecoveryNode = {
  id: 'security-review',
  tier: 'critical',
  independenceEssential: true,
  replacement: { id: 'security-review-backup', tier: 'critical' },
  sideEffectKey: 'effect:security-review',
};

function lifecycle(
  kind: string,
  seq: number,
  subject = SECURITY_NODE.id,
  payload: CanonicalEvent['payload'] = {},
): CanonicalEvent {
  return event({
    seq,
    eventId: `evt_00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    kind,
    subject,
    payload,
  });
}

function stream(events: readonly CanonicalEvent[]) {
  return replayEventLog(`${events.map(serializeEvent).join('\n')}\n`);
}

describe('mission recovery', () => {
  it('resumes the correct node at every retry and replacement transition', () => {
    const started = lifecycle('orchestration.node-started', 1, SECURITY_NODE.id, {
      attempt: 'initial',
    });
    const initialFailure = lifecycle('orchestration.node-failed', 2, SECURITY_NODE.id, {
      attempt: 'initial',
      transient: true,
    });
    const retryStarted = lifecycle('orchestration.node-started', 3, SECURITY_NODE.id, {
      attempt: 'retry',
    });
    const retryFailure = lifecycle('orchestration.node-failed', 4, SECURITY_NODE.id, {
      attempt: 'retry',
      transient: false,
    });
    const replacementStarted = lifecycle(
      'orchestration.node-started',
      5,
      SECURITY_NODE.id,
      { attempt: 'replacement', specialistId: 'security-review-backup' },
    );
    const replacementFailure = lifecycle(
      'orchestration.node-failed',
      6,
      SECURITY_NODE.id,
      { attempt: 'replacement', transient: false },
    );

    expect(planMissionRecovery(stream([]), [SECURITY_NODE]).action)
      .toMatchObject({ kind: 'run-node', attempt: 'initial' });
    expect(planMissionRecovery(stream([started]), [SECURITY_NODE]).action)
      .toMatchObject({ kind: 'run-node', attempt: 'initial' });
    expect(planMissionRecovery(
      stream([started, initialFailure]),
      [SECURITY_NODE],
    ).action).toMatchObject({
      kind: 'run-node',
      attempt: 'retry',
      reducedContext: true,
    });
    expect(planMissionRecovery(
      stream([started, initialFailure, retryStarted]),
      [SECURITY_NODE],
    ).action).toMatchObject({ kind: 'run-node', attempt: 'retry' });
    expect(planMissionRecovery(
      stream([started, initialFailure, retryStarted, retryFailure]),
      [SECURITY_NODE],
    ).action).toMatchObject({
      kind: 'run-node',
      attempt: 'replacement',
      specialistId: 'security-review-backup',
      tier: 'critical',
    });
    expect(planMissionRecovery(stream([
      started,
      initialFailure,
      retryStarted,
      retryFailure,
      replacementStarted,
    ]), [SECURITY_NODE]).action).toMatchObject({
      kind: 'run-node',
      attempt: 'replacement',
      specialistId: 'security-review-backup',
    });
    expect(planMissionRecovery(stream([
      started,
      initialFailure,
      retryStarted,
      retryFailure,
      replacementStarted,
      replacementFailure,
    ]), [SECURITY_NODE])).toMatchObject({
      status: 'blocked',
      action: { kind: 'stop' },
    });
  });

  it('falls back to sequential execution only when independence is not essential', () => {
    const node: RecoveryNode = {
      ...SECURITY_NODE,
      id: 'non-independent-check',
      independenceEssential: false,
    };
    const events = [
      lifecycle('orchestration.node-started', 1, node.id, { attempt: 'initial' }),
      lifecycle('orchestration.node-failed', 2, node.id, { attempt: 'initial' }),
      lifecycle('orchestration.node-started', 3, node.id, { attempt: 'retry' }),
      lifecycle('orchestration.node-failed', 4, node.id, { attempt: 'retry' }),
      lifecycle('orchestration.node-started', 5, node.id, { attempt: 'replacement' }),
      lifecycle('orchestration.node-failed', 6, node.id, { attempt: 'replacement' }),
    ];

    expect(planMissionRecovery(stream(events), [node]).action).toMatchObject({
      kind: 'run-node',
      attempt: 'sequential',
      execution: 'sequential',
    });
  });

  it('advances to the next incomplete node after a durable completion', () => {
    const qa: RecoveryNode = {
      id: 'qa-review',
      tier: 'standard',
      independenceEssential: false,
    };
    const completed = lifecycle(
      'orchestration.node-completed',
      1,
      SECURITY_NODE.id,
    );

    expect(planMissionRecovery(stream([completed]), [SECURITY_NODE, qa]).action)
      .toMatchObject({ kind: 'run-node', nodeId: qa.id, attempt: 'initial' });
  });

  it('uses a receipt to finalize without invoking a proven side effect twice', () => {
    const calls: string[] = [];
    const started = lifecycle('orchestration.node-started', 1, SECURITY_NODE.id, {
      attempt: 'initial',
    });
    const first = planMissionRecovery(stream([started]), [SECURITY_NODE]);
    if (first.action.kind === 'run-node') {
      calls.push(first.action.idempotencyKey ?? 'missing');
    }
    const receipt = lifecycle(
      'side-effect.completed',
      2,
      SECURITY_NODE.sideEffectKey,
      { nodeId: SECURITY_NODE.id, receiptId: 'rcp_security_001' },
    );
    const resumed = planMissionRecovery(stream([started, receipt]), [SECURITY_NODE]);

    expect(resumed.action).toEqual({
      kind: 'finalize-node',
      nodeId: SECURITY_NODE.id,
      receiptId: 'rcp_security_001',
    });
    expect(calls).toEqual(['effect:security-review']);
  });

  it('fails closed when event continuity cannot be proved', () => {
    const gapped = stream([
      lifecycle('orchestration.node-started', 2, SECURITY_NODE.id, {
        attempt: 'initial',
      }),
    ]);

    expect(planMissionRecovery(gapped, [SECURITY_NODE])).toMatchObject({
      status: 'degraded',
      action: { kind: 'stop' },
    });
  });
});
