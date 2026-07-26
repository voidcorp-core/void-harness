import { describe, expect, it } from 'vitest';
import { missionVerdictExitCode, parseMissionArgs } from './mission.js';

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

  it('fails the process for stale, blocked, or degraded verdicts', () => {
    expect(missionVerdictExitCode('verified')).toBe(0);
    expect(missionVerdictExitCode('shipped-with-exception')).toBe(0);
    expect(missionVerdictExitCode('unverified')).toBe(1);
    expect(missionVerdictExitCode('blocked')).toBe(1);
    expect(missionVerdictExitCode('degraded')).toBe(1);
  });
});
