import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../prerequisites.js';
import { autopilotPreflight, type AutopilotObservation } from './preflight.js';

function observation(over: Partial<AutopilotObservation> = {}): AutopilotObservation {
  return {
    activeProgram: {
      status: 'executing',
      autopilot: { enabled: true, mergeGate: 'human', verifyCommands: [['pnpm', 'test']] },
    },
    adapters: ['claude'],
    trackerConnector: true,
    worktreesUsable: true,
    baseProtected: true,
    ...over,
  };
}

function named(results: readonly CheckResult[], name: string): CheckResult | undefined {
  return results.find((result) => result.name === name);
}

describe('autopilotPreflight', () => {
  it('passes a project that is actually ready', () => {
    expect(autopilotPreflight(observation()).every((check) => check.ok)).toBe(true);
  });

  it('every failing check says what to do about it', () => {
    const broken = autopilotPreflight(
      observation({
        activeProgram: null,
        adapters: [],
        trackerConnector: false,
        worktreesUsable: false,
        baseProtected: false,
      }),
    );

    for (const check of broken.filter((result) => !result.ok)) {
      expect(check.fix, check.name).toBeTruthy();
    }
  });
});

describe('the active program', () => {
  it('reports an absent ACTIVE as unknown, not as a failure', () => {
    // Most projects have no program to drain. That is not a broken harness.
    expect(named(autopilotPreflight(observation({ activeProgram: null })), 'autopilot ACTIVE')?.status).toBe(
      'unknown',
    );
  });

  it('fails a program that is not executing', () => {
    const results = autopilotPreflight(
      observation({ activeProgram: { status: 'completed', autopilot: { enabled: true } } }),
    );

    expect(named(results, 'autopilot ACTIVE')?.status).toBe('fail');
  });

  it('fails when autopilot is not enabled, because nothing would resume', () => {
    const results = autopilotPreflight(
      observation({ activeProgram: { status: 'executing', autopilot: { enabled: false } } }),
    );

    expect(named(results, 'autopilot ACTIVE')?.message).toMatch(/enabled/);
  });
});

describe('the merge gate', () => {
  it('accepts only a human gate', () => {
    const results = autopilotPreflight(
      observation({
        activeProgram: { status: 'executing', autopilot: { enabled: true, mergeGate: 'auto' } },
      }),
    );

    const check = named(results, 'autopilot merge');
    expect(check?.status).toBe('fail');
    expect(check?.fix).toMatch(/never merges/);
  });

  it('treats an absent gate as human rather than as a missing value', () => {
    const results = autopilotPreflight(
      observation({ activeProgram: { status: 'executing', autopilot: { enabled: true } } }),
    );

    expect(named(results, 'autopilot merge')?.ok).toBe(true);
  });
});

describe('the verify commands', () => {
  it('fails when there are none, because nothing would prove the branch', () => {
    const results = autopilotPreflight(
      observation({
        activeProgram: { status: 'executing', autopilot: { enabled: true, verifyCommands: [] } },
      }),
    );

    expect(named(results, 'autopilot verify')?.status).toBe('fail');
  });

  it('rejects a command that is not a usable argv array', () => {
    for (const command of [[], ['pnpm', ''], 'pnpm test' as unknown as string[]]) {
      const results = autopilotPreflight(
        observation({
          activeProgram: { status: 'executing', autopilot: { enabled: true, verifyCommands: [command] } },
        }),
      );

      expect(named(results, 'autopilot verify')?.status, JSON.stringify(command)).toBe('fail');
    }
  });

  it('says why argv rather than a string, in the fix', () => {
    const results = autopilotPreflight(
      observation({
        activeProgram: { status: 'executing', autopilot: { enabled: true, verifyCommands: [[]] } },
      }),
    );

    expect(named(results, 'autopilot verify')?.fix).toMatch(/shell:false/);
  });
});

describe('what could not be read is not what is false', () => {
  it('keeps unreadable branch protection apart from an unprotected branch', () => {
    const unreadable = named(autopilotPreflight(observation({ baseProtected: null })), 'autopilot base');
    const unprotected = named(autopilotPreflight(observation({ baseProtected: false })), 'autopilot base');

    expect(unreadable?.status).toBe('unknown');
    expect(unprotected?.status).toBe('fail');
    expect(unreadable?.message).not.toEqual(unprotected?.message);
  });

  it('keeps an unprobed tracker apart from an unreachable one', () => {
    expect(named(autopilotPreflight(observation({ trackerConnector: null })), 'autopilot tracker')?.status).toBe(
      'unknown',
    );
    expect(named(autopilotPreflight(observation({ trackerConnector: false })), 'autopilot tracker')?.status).toBe(
      'fail',
    );
  });

  it('keeps undetermined worktree support apart from unusable worktrees', () => {
    expect(named(autopilotPreflight(observation({ worktreesUsable: null })), 'autopilot worktrees')?.status).toBe(
      'unknown',
    );
    expect(named(autopilotPreflight(observation({ worktreesUsable: false })), 'autopilot worktrees')?.status).toBe(
      'fail',
    );
  });
});

describe('the runtime adapter', () => {
  it('fails when none is detected, because no worker could be spawned', () => {
    expect(named(autopilotPreflight(observation({ adapters: [] })), 'autopilot runtime')?.status).toBe('fail');
  });

  it('ignores an adapter it does not know rather than counting it', () => {
    expect(named(autopilotPreflight(observation({ adapters: ['hermes'] })), 'autopilot runtime')?.status).toBe(
      'fail',
    );
  });

  it('accepts either supported runtime', () => {
    for (const adapter of ['claude', 'codex']) {
      expect(named(autopilotPreflight(observation({ adapters: [adapter] })), 'autopilot runtime')?.ok).toBe(true);
    }
  });
});

describe('the doctor wiring', () => {
  const DOCTOR = readFileSync(new URL('../../commands/doctor.ts', import.meta.url), 'utf8');

  it('runs the preflight only for a project that declares a program', () => {
    // Seven extra checks on every project would be noise about a feature they
    // do not use, and would make `doctor` look broken where nothing is wrong.
    expect(DOCTOR).toMatch(/plans', 'ACTIVE\.md'\)\)\) \{\n\s*checks\.push\(\.\.\.autopilotPreflight/);
  });

  it('probes nothing remote, because --no-remote promises an offline run', () => {
    const observer = DOCTOR.slice(DOCTOR.indexOf('function observeAutopilot'));
    expect(observer).toMatch(/trackerConnector: null/);
    expect(observer).toMatch(/baseProtected: null/);
  });

  it('reports a malformed ACTIVE as a failed check rather than crashing doctor', () => {
    const observer = DOCTOR.slice(DOCTOR.indexOf('function observeAutopilot'));
    expect(observer).toMatch(/catch \{/);
  });
});
