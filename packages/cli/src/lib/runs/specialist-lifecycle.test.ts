import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendMissionEvent, createMission, inspectMission } from './store.js';
import {
  parseSpecialistLifecycleInput,
  recordSpecialistLifecycle,
  recordSpecialistRequests,
} from './specialist-lifecycle.js';

const ID = 'mis_0123456789abcdef0123456789abcdef';
const HASH = `sha256:${'a'.repeat(64)}`;
const ENVELOPE = {
  schemaVersion: 1,
  missionId: ID,
  runtime: 'codex',
  specialistId: 'core:security-engineer',
  agentName: 'security-engineer',
  contractVersion: 2,
  stage: 'post-implementation',
  reviewRound: 1,
  inputHash: HASH,
} as const;
const COMPLETION = {
  schemaVersion: 1,
  specialistId: 'core:security-engineer',
  contractVersion: 2,
  completionId: 'cmp_security_0001',
  verdict: 'pass',
  findings: [],
  evidenceRequests: [],
  limitations: [],
} as const;

describe('specialist lifecycle adapter', () => {
  it('parses only bounded lifecycle data that matches the dispatch envelope', () => {
    expect(parseSpecialistLifecycleInput('completed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      completion: COMPLETION,
    })).toMatchObject({
      status: 'completed',
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      completion: COMPLETION,
    });

    expect(() => parseSpecialistLifecycleInput('completed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      completion: { ...COMPLETION, specialistId: 'core:solution-architect' },
    })).toThrow('SPECIALIST_LIFECYCLE_INVALID');
    expect(() => parseSpecialistLifecycleInput('failed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      reason: 'x'.repeat(501),
    })).toThrow('SPECIALIST_LIFECYCLE_INVALID');
    expect(() => parseSpecialistLifecycleInput('started', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      rawPrompt: 'must never be retained',
    })).toThrow('SPECIALIST_LIFECYCLE_INVALID');
  });

  it('records attributed start, completion, and failure events without raw output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-specialist-lifecycle-'));
    await createMission(root, {
      missionId: ID,
      title: 'Review a trust boundary',
      mode: 'team',
    });

    await recordSpecialistRequests(root, ID, [ENVELOPE], HASH);
    await recordSpecialistRequests(root, ID, [ENVELOPE], HASH);
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('started', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
    }));
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('completed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      completion: COMPLETION,
    }));
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('completed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      completion: COMPLETION,
    }));
    const roundTwo = { ...ENVELOPE, reviewRound: 2 };
    await recordSpecialistRequests(root, ID, [roundTwo], HASH);
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('started', {
      envelope: roundTwo,
      contextId: 'ctx_security_0002',
    }));
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('failed', {
      envelope: roundTwo,
      contextId: 'ctx_security_0002',
      reason: 'timeout',
    }));

    const inspected = await inspectMission(root, ID, { dependencies: {} });
    expect(inspected.stream.events.slice(1).map((event) => event.kind)).toEqual([
      'specialist.requested',
      'specialist.started',
      'specialist.completed',
      'specialist.requested',
      'specialist.started',
      'specialist.failed',
    ]);
    expect(inspected.stream.events[3]).toMatchObject({
      source: 'runtime:codex',
      subject: 'core:security-engineer',
      payload: {
        stage: 'post-implementation',
        reviewRound: 1,
        inputHash: HASH,
        contextId: 'ctx_security_0001',
        completion: COMPLETION,
      },
    });
    expect(JSON.stringify(inspected.stream.events)).not.toContain('rawPrompt');
  });

  it('rejects forged, conflicting, and secret-bearing terminal events', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-specialist-lifecycle-'));
    await createMission(root, {
      missionId: ID,
      title: 'Reject forged specialist proof',
      mode: 'team',
    });
    const completion = parseSpecialistLifecycleInput('completed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      completion: COMPLETION,
    });

    await expect(recordSpecialistLifecycle(root, ID, completion)).rejects.toThrow(
      'no matching specialist.requested',
    );
    await recordSpecialistRequests(root, ID, [ENVELOPE], HASH);
    await expect(recordSpecialistLifecycle(root, ID, completion)).rejects.toThrow(
      'no matching specialist.started',
    );
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('started', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
    }));
    await recordSpecialistLifecycle(root, ID, completion);
    await expect(recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('failed', {
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
      reason: 'late failure',
    }))).rejects.toThrow('different terminal event');

    const inspected = await inspectMission(root, ID, { dependencies: {} });
    expect(inspected.stream.events.filter((event) =>
      event.kind === 'specialist.completed' || event.kind === 'specialist.failed')).toHaveLength(1);

    const secretRound = { ...ENVELOPE, reviewRound: 2 };
    await recordSpecialistRequests(root, ID, [secretRound], HASH);
    await recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('started', {
      envelope: secretRound,
      contextId: 'ctx_security_0002',
    }));
    await expect(recordSpecialistLifecycle(root, ID, parseSpecialistLifecycleInput('failed', {
      envelope: secretRound,
      contextId: 'ctx_security_0002',
      reason: 'token=supersecretvalue',
    }))).rejects.toThrow('SPECIALIST_LIFECYCLE_CONTAINS_SECRET');
  });

  it('rejects runtime lifecycle evidence after explicit mission closure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-specialist-lifecycle-'));
    await createMission(root, {
      missionId: ID,
      title: 'Close specialist lifecycle',
      mode: 'team',
    });
    await recordSpecialistRequests(root, ID, [ENVELOPE], HASH);
    await appendMissionEvent(root, ID, {
      source: 'void-harness:mission.close',
      kind: 'mission.closed',
      subject: 'mission',
      correlationId: ID,
      payload: { reason: 'interrupted' },
    });

    await expect(recordSpecialistLifecycle(root, ID, {
      status: 'started',
      envelope: ENVELOPE,
      contextId: 'ctx_security_0001',
    })).rejects.toThrow('mission is closed');
  });
});
