import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  missionVerdictExitCode,
  missionRecoveryExitCode,
  parseMissionArgs,
  planMission,
  renderMissionFailure,
} from './mission.js';

describe('parseMissionArgs', () => {
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
