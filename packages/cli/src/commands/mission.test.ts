import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type MissionSpecialistPlan } from '@voidcorp/mission-engine';
import {
  constrainCapabilityByAttestation,
  coordinatorRuntimeIdentity,
  dispatchMissionSpecialists,
  missionVerdictExitCode,
  missionRecoveryExitCode,
  normalizeControllerTicketPath,
  parseMissionArgs,
  planMission,
  recordLeadWriterCompletion,
  recordMissionClosure,
  renderMissionFailure,
} from './mission.js';
import {
  createMission,
  inspectMission,
  missionControllerRoutingHash,
  writeMissionControllerPlan,
} from '../lib/runs/store.js';
import { recordSpecialistLifecycle } from '../lib/runs/specialist-lifecycle.js';

describe('parseMissionArgs', () => {
  it('persists controller ticket paths with portable separators', () => {
    expect(normalizeControllerTicketPath('tickets\\DEV-500.md')).toBe('tickets/DEV-500.md');
    expect(normalizeControllerTicketPath('tickets/DEV-500.md')).toBe('tickets/DEV-500.md');
  });

  it('defaults mission start to team mode', () => {
    expect(
      parseMissionArgs(['start', '--title', 'Ship evidence']),
    ).toEqual({
      kind: 'start',
      title: 'Ship evidence',
      mode: 'team',
      json: false,
    });
  });

  it('derives controller runtime identity instead of accepting a caller choice', () => {
    expect(parseMissionArgs([
      'start',
      '--title',
      'Review API',
      '--ticket',
      'DEV-500.md',
    ])).toEqual({
      kind: 'start',
      title: 'Review API',
      mode: 'team',
      ticketPath: 'DEV-500.md',
      json: false,
    });
    expect(coordinatorRuntimeIdentity({
      CLAUDECODE: '1',
      CODEX_SESSION_ID: 'codex-session',
    })).toEqual({ runtime: 'codex', attested: true });
    expect(coordinatorRuntimeIdentity({ CLAUDECODE: '1' })).toEqual({
      runtime: 'claude',
      attested: true,
    });
    const unknown = coordinatorRuntimeIdentity({});
    expect(unknown).toEqual({ runtime: 'codex', attested: false });
    expect(constrainCapabilityByAttestation(unknown, {
      status: 'available',
      limitations: [],
    })).toMatchObject({ status: 'degraded' });
  });

  it('keeps command argv separate from mission options', () => {
    expect(
      parseMissionArgs([
        'verify',
        '--id',
        'mis_0123456789abcdef0123456789abcdef',
        '--json',
        '--',
        'pnpm',
        'test',
      ]),
    ).toEqual({
      kind: 'verify',
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      shell: false,
      command: ['pnpm', 'test'],
      json: true,
    });
  });

  it('passes --help through to the verified command', () => {
    expect(
      parseMissionArgs([
        'verify',
        '--id',
        'mis_0123456789abcdef0123456789abcdef',
        '--',
        'node',
        '--help',
      ]),
    ).toMatchObject({
      kind: 'verify',
      command: ['node', '--help'],
    });
  });

  it('requires one explicit command string for shell mode', () => {
    expect(
      parseMissionArgs([
        'verify',
        '--id',
        'mis_0123456789abcdef0123456789abcdef',
        '--shell',
        '--',
        'pnpm test',
        '&& echo unsafe',
      ]),
    ).toMatchObject({
      kind: 'invalid',
      code: 'MISSION_USAGE',
    });
  });

  it('keeps prune dry-run unless apply is explicit', () => {
    expect(
      parseMissionArgs(['prune', '--older-than', '30']),
    ).toEqual({
      kind: 'prune',
      olderThanDays: 30,
      apply: false,
      json: false,
    });
  });

  it('parses an idempotent mission resume request', () => {
    expect(parseMissionArgs([
      'resume',
      '--id',
      'mis_0123456789abcdef0123456789abcdef',
      '--json',
    ])).toEqual({
      kind: 'resume',
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      json: true,
    });
  });

  it('parses deterministic mission planning', () => {
    expect(parseMissionArgs([
      'plan',
      '--ticket',
      'tickets/DEV-435.md',
      '--json',
    ])).toEqual({
      kind: 'plan',
      ticketPath: 'tickets/DEV-435.md',
      json: true,
    });
  });

  it('parses a runtime-neutral specialist dispatch request', () => {
    expect(parseMissionArgs([
      'dispatch',
      '--id',
      'mis_0123456789abcdef0123456789abcdef',
      '--json',
    ])).toEqual({
      kind: 'dispatch',
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      json: true,
    });
  });

  it('parses a bounded specialist lifecycle event file', () => {
    expect(parseMissionArgs([
      'specialist-event',
      '--id',
      'mis_0123456789abcdef0123456789abcdef',
      '--status',
      'completed',
      '--input',
      '.void/machine/specialist-completion.json',
      '--json',
    ])).toEqual({
      kind: 'specialist-event',
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      status: 'completed',
      inputPath: '.void/machine/specialist-completion.json',
      json: true,
    });
  });

  it('parses an attributed lead-writer completion', () => {
    expect(parseMissionArgs([
      'writer-event',
      '--id',
      'mis_0123456789abcdef0123456789abcdef',
      '--json',
    ])).toEqual({
      kind: 'writer-event',
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      json: true,
    });
  });

  it('parses an explicit mission closure used by lifecycle learning', () => {
    expect(parseMissionArgs([
      'close',
      '--id',
      'mis_0123456789abcdef0123456789abcdef',
      '--reason',
      'interrupted',
      '--json',
    ])).toEqual({
      kind: 'close',
      missionId: 'mis_0123456789abcdef0123456789abcdef',
      reason: 'interrupted',
      json: true,
    });
  });

  it.each([
    ['manual stage bypass', ['dispatch', '--id', 'mis_0123456789abcdef0123456789abcdef', '--stage', 'post-implementation']],
    ['caller-selected runtime', ['start', '--title', 'x', '--ticket', 'ticket.md', '--runtime', 'claude']],
    ['fast controller start', ['start', '--title', 'x', '--ticket', 'ticket.md', '--mode', 'fast']],
    ['invalid lifecycle status', ['specialist-event', '--id', 'mis_0123456789abcdef0123456789abcdef', '--status', 'requested', '--input', 'event.json']],
    ['invalid closure reason', ['close', '--id', 'mis_0123456789abcdef0123456789abcdef', '--reason', 'complete']],
  ])('rejects unsafe specialist input: %s', (_name, args) => {
    expect(parseMissionArgs(args)).toMatchObject({ kind: 'invalid' });
  });

  it.each([
    [['plan'], 'missing required option --ticket'],
    [['plan', '--ticket'], 'missing value for --ticket'],
    [['plan', '--ticket', 'ticket.md', '--unknown'], "unknown option '--unknown'"],
  ] as const)('rejects invalid plan arguments', (args, problem) => {
    expect(parseMissionArgs(args)).toMatchObject({
      kind: 'invalid',
      code: 'MISSION_USAGE',
      problem,
    });
  });

  it('fails the process for stale, blocked, or degraded verdicts', () => {
    expect(missionVerdictExitCode('verified')).toBe(0);
    expect(missionVerdictExitCode('shipped-with-exception')).toBe(0);
    expect(missionVerdictExitCode('unverified')).toBe(1);
    expect(missionVerdictExitCode('blocked')).toBe(1);
    expect(missionVerdictExitCode('degraded')).toBe(1);
  });

  it('fails resume when no safe recovery decision is actionable', () => {
    expect(missionRecoveryExitCode('active')).toBe(0);
    expect(missionRecoveryExitCode('complete')).toBe(0);
    expect(missionRecoveryExitCode('waiting')).toBe(1);
    expect(missionRecoveryExitCode('blocked')).toBe(1);
    expect(missionRecoveryExitCode('degraded')).toBe(1);
  });

  it('plans a real ticket deterministically and degrades outside git', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-plan-'));
    await writeFile(join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
      devDependencies: { vitest: '^4.1.9' },
    }));
    await writeFile(
      join(root, 'DEV-435.md'),
      '# Compile policies\n\nAdd a tested API module with observability.\n',
    );
    const first = await planMission(
      root,
      'DEV-435.md',
      '2026-07-26T00:00:00Z',
    );
    const second = await planMission(
      root,
      'DEV-435.md',
      '2026-07-26T00:01:00Z',
    );
    expect(first.planHash).toBe(second.planHash);
    expect(first.context).toMatchObject({ status: 'degraded' });
    expect(first.applicability).toHaveLength(13);
    expect(first.specialists).toHaveLength(16);
    expect(first.specialists.map((item) => item.specialistId)).toEqual(expect.arrayContaining([
      'core:data-migration-engineer',
      'core:api-integration-engineer',
      'core:observability-sre-engineer',
      'core:accessibility-specialist',
      'core:devex-docs-engineer',
      'core:independent-code-reviewer',
      'core:pdf-specialist',
    ]));
    expect(first.specialists.every((item) => item.proof.inputHash === first.inputHash)).toBe(true);
  });

  it('records every dispatch request once before the runtime launches agents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-dispatch-'));
    const missionId = 'mis_0123456789abcdef0123456789abcdef';
    await writeFile(join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
    }));
    await writeFile(
      join(root, 'DEV-500.md'),
      '# Runtime API review\n\nVerify the tested API runtime and observability change.\n',
    );
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', 'package.json', 'DEV-500.md'], { cwd: root });
    execFileSync('git', [
      '-c', 'user.name=Void Test',
      '-c', 'user.email=void@example.test',
      'commit', '--quiet', '-m', 'test: seed mission fixture',
    ], { cwd: root });
    const plan = await planMission(root, 'DEV-500.md', '2026-08-21T12:00:00.000Z');
    const controllerPlan: MissionSpecialistPlan = {
      planHash: plan.planHash,
      context: plan.context,
      specialists: plan.specialists.map((specialist) => ({
        specialistId: specialist.specialistId,
        contractVersion: specialist.contractVersion,
        inputHash: specialist.proof.inputHash,
        state: specialist.state,
        stages: specialist.stages,
      })),
    };
    const ticketBody = '# Runtime API review\n\nVerify the tested API runtime and observability change.\n';
    const ticketBinding = {
      path: 'DEV-500.md',
      contentHash: `sha256:${createHash('sha256').update(ticketBody).digest('hex')}`,
    };
    await createMission(root, {
      missionId,
      title: 'Runtime API review',
      mode: 'team',
      teamController: {
        planHash: plan.planHash,
        routingHash: missionControllerRoutingHash(controllerPlan, ticketBinding),
        leadWriterId: 'writer:primary',
        runtime: 'codex',
      },
    });
    await writeMissionControllerPlan(root, missionId, controllerPlan, ticketBinding);
    await writeFile(join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
      scripts: { lint: 'tsc --noEmit' },
    }));
    const changedPlan = await planMission(
      root,
      'DEV-500.md',
      '2026-08-21T12:00:00.000Z',
    );
    expect(changedPlan.inputHash).not.toBe(plan.inputHash);
    const input = {
      kind: 'dispatch' as const,
      missionId,
      json: true,
    };

    const capability = {
      status: 'degraded' as const,
      limitations: ['fixture cannot enforce native isolation'],
    };
    const first = await dispatchMissionSpecialists(root, input, '2026-08-21T12:00:00.000Z', capability);
    const second = await dispatchMissionSpecialists(root, input, '2026-08-21T12:00:00.000Z', capability);
    const inspected = await inspectMission(root, missionId, { dependencies: {} });
    const requested = inspected.stream.events.filter((event) =>
      event.kind === 'specialist.requested');

    expect(first.envelopes.length).toBeGreaterThan(0);
    expect(first.action).toMatchObject({
      kind: 'invoke-specialists',
      stage: 'pre-implementation',
    });
    for (const envelope of first.envelopes) {
      const frozen = controllerPlan.specialists.find((specialist) =>
        specialist.specialistId === envelope.specialistId);
      expect(envelope.inputHash).toBe(frozen?.inputHash);
    }
    expect(second.envelopes).toEqual(first.envelopes);
    expect(requested).toHaveLength(first.envelopes.length);
    expect(requested.map((event) => event.subject)).toEqual(
      first.envelopes.map((envelope) => envelope.specialistId),
    );
    await expect(recordLeadWriterCompletion(root, {
      kind: 'writer-event',
      missionId,
      json: true,
    })).rejects.toThrow('no controller writer request is pending');

    for (const [index, envelope] of first.envelopes.entries()) {
      const contextId = `ctx_dispatch_${index}_${envelope.agentName}`;
      await recordSpecialistLifecycle(root, missionId, {
        status: 'started',
        envelope,
        contextId,
      });
      await recordSpecialistLifecycle(root, missionId, {
        status: 'completed',
        envelope,
        contextId,
        completion: {
          schemaVersion: 1,
          specialistId: envelope.specialistId,
          contractVersion: envelope.contractVersion,
          completionId: `cmp_dispatch_${index}_${envelope.agentName}`,
          verdict: 'pass',
          findings: [],
          evidenceRequests: [],
          limitations: [],
        },
      });
    }
    const writerAction = await dispatchMissionSpecialists(
      root,
      input,
      '2026-08-21T12:00:00.000Z',
      capability,
    );
    expect(writerAction).toMatchObject({
      planHash: plan.planHash,
      action: { kind: 'run-lead-writer', writerId: 'writer:primary' },
      nextWriterRound: 1,
    });
    await recordLeadWriterCompletion(root, {
      kind: 'writer-event',
      missionId,
      json: true,
    });
    await recordLeadWriterCompletion(root, {
      kind: 'writer-event',
      missionId,
      json: true,
    });
    const writerCompletions = (await inspectMission(root, missionId, {
      dependencies: {},
    })).stream.events.filter((event) => event.kind === 'lead-writer.completed');
    expect(writerCompletions).toHaveLength(1);
    await writeFile(join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
      scripts: { test: 'vitest run' },
    }));
    const post = await dispatchMissionSpecialists(
      root,
      input,
      '2026-08-21T12:01:00.000Z',
      capability,
    );
    expect(post.planHash).toBe(plan.planHash);
    expect(post.action).toMatchObject({
      kind: 'invoke-specialists',
      stage: 'post-implementation',
    });
    expect(post.envelopes.length).toBeGreaterThan(0);

    const requestsBeforeTicketChange = (await inspectMission(root, missionId, {
      dependencies: {},
    })).stream.events.filter((event) => event.kind === 'specialist.requested').length;
    await writeFile(
      join(root, 'DEV-500.md'),
      '# Different ticket\n\nChange authentication scope.\n',
    );
    await expect(dispatchMissionSpecialists(
      root,
      input,
      '2026-08-21T12:02:00.000Z',
      capability,
    )).rejects.toThrow('MISSION_TICKET_CHANGED');
    const requestsAfterTicketChange = (await inspectMission(root, missionId, {
      dependencies: {},
    })).stream.events.filter((event) => event.kind === 'specialist.requested').length;
    expect(requestsAfterTicketChange).toBe(requestsBeforeTicketChange);
  });

  it('closes a mission once and rejects a conflicting closure reason', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-close-'));
    const missionId = 'mis_0123456789abcdef0123456789abcdef';
    await createMission(root, { missionId, title: 'Close lifecycle', mode: 'team' });

    await recordMissionClosure(root, missionId, 'interrupted');
    await recordMissionClosure(root, missionId, 'interrupted');
    await expect(recordMissionClosure(root, missionId, 'abandoned')).rejects.toThrow(
      'MISSION_CLOSURE_CONFLICT',
    );

    const inspected = await inspectMission(root, missionId, { dependencies: {} });
    expect(inspected.stream.events.filter((event) => event.kind === 'mission.closed')).toHaveLength(1);
  });

  it('closes the mission automatically when the controller stops', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-stop-'));
    const missionId = 'mis_0123456789abcdef0123456789abcdef';
    const ticketBody = '# Stop unavailable runtime\n\nReview an API boundary.\n';
    await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.34.5' }));
    await writeFile(join(root, 'DEV-STOP.md'), ticketBody);
    const plan = await planMission(root, 'DEV-STOP.md', '2026-08-21T12:00:00.000Z');
    const controllerPlan: MissionSpecialistPlan = {
      planHash: plan.planHash,
      context: plan.context,
      specialists: plan.specialists.map((specialist) => ({
        specialistId: specialist.specialistId,
        contractVersion: specialist.contractVersion,
        inputHash: specialist.proof.inputHash,
        state: specialist.state,
        stages: specialist.stages,
      })),
    };
    const ticketBinding = {
      path: 'DEV-STOP.md',
      contentHash: `sha256:${createHash('sha256').update(ticketBody).digest('hex')}`,
    };
    await createMission(root, {
      missionId,
      title: 'Stop unavailable runtime',
      mode: 'team',
      teamController: {
        planHash: plan.planHash,
        routingHash: missionControllerRoutingHash(controllerPlan, ticketBinding),
        leadWriterId: 'writer:primary',
        runtime: 'codex',
      },
    });
    await writeMissionControllerPlan(root, missionId, controllerPlan, ticketBinding);

    const decision = await dispatchMissionSpecialists(root, {
      kind: 'dispatch',
      missionId,
      json: true,
    }, '2026-08-21T12:00:00.000Z', {
      status: 'unavailable',
      limitations: ['no isolated runtime'],
    });

    expect(decision.action.kind).toBe('stop');
    const inspected = await inspectMission(root, missionId, { dependencies: {} });
    expect(inspected.stream.events).toContainEqual(expect.objectContaining({
      kind: 'mission.closed',
      payload: { reason: 'controller-stop' },
    }));
    await expect(dispatchMissionSpecialists(root, {
      kind: 'dispatch',
      missionId,
      json: true,
    }, '2026-08-21T12:00:00.000Z', {
      status: 'unavailable',
      limitations: ['no isolated runtime'],
    })).rejects.toThrow('MISSION_CLOSED');
  });

  it('applies fortress policy overlays to high-risk planning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-fortress-'));
    await writeFile(join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
    }));
    await writeFile(
      join(root, 'DEV-442.md'),
      '# Authentication permissions\n\nHarden auth permissions.\n',
    );

    const plan = await planMission(
      root,
      'DEV-442.md',
      '2026-07-27T00:00:00Z',
    );
    const decisions = Object.fromEntries(
      plan.applicability.map((item) => [item.pass, item]),
    );

    expect(plan.risk.requiredMode).toBe('fortress');
    expect(decisions.architecture).toMatchObject({
      state: 'pending',
      depth: 'deep',
    });
    expect(decisions.security).toMatchObject({
      state: 'pending',
      depth: 'deep',
    });
    expect(decisions.qa).toMatchObject({
      state: 'pending',
      depth: 'deep',
    });
  });

  it('loads the UI core policy and makes frontend TDD, craft, and accessibility deep passes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-ui-'));
    await writeFile(join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
    }));
    await writeFile(
      join(root, 'DEV-444.md'),
      '# Accessible action menu UI\n\nAdd a keyboard-accessible React component and error state.\n',
    );

    const plan = await planMission(root, 'DEV-444.md', '2026-07-27T00:00:00Z');
    const decisions = Object.fromEntries(
      plan.applicability.map((item) => [item.pass, item]),
    );

    expect(plan.policySources).toContain('core:ui-quality');
    expect(decisions.tdd).toMatchObject({ state: 'pending', depth: 'deep' });
    expect(decisions['ux-ui']).toMatchObject({ state: 'pending', depth: 'deep' });
    expect(decisions.accessibility).toMatchObject({ state: 'pending', depth: 'deep' });
  });

  it('renders structured JSON failures without hiding the root cause', () => {
    expect(JSON.parse(renderMissionFailure(
      new Error('POLICY_PATH_ESCAPE: policy resolves outside root'),
      true,
    ))).toEqual({
      error: {
        code: 'POLICY_PATH_ESCAPE',
        problem: 'mission command could not complete',
        cause: 'policy resolves outside root',
        fix: 'correct the reported input or policy and retry',
      },
    });
  });
});
