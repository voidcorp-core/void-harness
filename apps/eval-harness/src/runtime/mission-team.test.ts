import { replayEventLog } from '@voidcorp/mission-engine';
import { describe, expect, it } from 'vitest';
import { MISSION_TEAM_EVENTS } from '../cases/mission-team.js';
import type { EvalCase, RunOnce } from '../types.js';
import type { EvalRuntime } from '../cli-args.js';
import {
  createMissionTeamRunOnce,
  SPECIALIST_OUTPUT_SCHEMA,
} from './mission-team.js';
import type {
  ExecuteSpecialist,
  SpecialistExecutionInput,
} from './process.js';
import type { RuntimeInvocation } from './types.js';

const SPECIALISTS = [
  'solution-architect',
  'security-engineer',
  'test-qa-engineer',
] as const;

function codexAgent(name: string): string {
  return [
    `name = ${JSON.stringify(name)}`,
    'description = "Test specialist"',
    'sandbox_mode = "read-only"',
    'web_search = "disabled"',
    'mcp_servers = {}',
    `developer_instructions = ${JSON.stringify(`Own ${name}.`)}`,
    '',
  ].join('\n');
}

function evalCase(runtime: EvalRuntime): EvalCase {
  const agents = Object.fromEntries(SPECIALISTS.map((name) => [
    runtime === 'claude'
      ? `.claude/agents/${name}.md`
      : `.codex/agents/${name}.toml`,
    runtime === 'claude' ? `# ${name}\n` : codexAgent(name),
  ]));
  return {
    skill: 'ticket-runner',
    title: 'mission team',
    prompt: 'Review DEV-EVAL.',
    fixture: { ...agents, 'src/example.ts': 'export const value = 1;\n' },
    scorer: () => ({ score: 0, signals: {} }),
  };
}

function completion(specialistId: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    specialistId,
    contractVersion: 1,
    completionId: `cmp_${specialistId.slice(5)}`,
    verdict: 'changes-requested',
    findings: [{
      id: `finding-${specialistId.slice(5)}`,
      severity: 'high',
      summary: 'Concrete blocker.',
      evidence: [{ path: 'src/example.ts', line: 1, detail: 'Observed evidence.' }],
      recommendation: 'Correct the blocker.',
    }],
    evidenceRequests: [],
    limitations: [],
  };
}

function executor(
  runtime: EvalRuntime,
  failQa = false,
  degraded = false,
): ExecuteSpecialist {
  return (
    invocation: RuntimeInvocation,
    _cwd: string,
    input: SpecialistExecutionInput,
  ) => {
    const failed = failQa && input.specialistId === 'core:test-qa-engineer';
    const value = degraded
      ? {
          ...completion(input.specialistId),
          verdict: 'degraded',
          findings: [],
          limitations: ['Repository evidence is unavailable.'],
        }
      : completion(input.specialistId);
    const stdout = runtime === 'claude'
      ? JSON.stringify({
          session_id: `ctx_${input.specialistId.slice(5)}`,
          is_error: false,
          structured_output: value,
          total_cost_usd: 0.01,
        })
      : [
          JSON.stringify({
            type: 'thread.started',
            thread_id: `ctx_${input.specialistId.slice(5)}`,
          }),
          JSON.stringify({
            type: 'item.completed',
            item: { type: 'agent_message', text: JSON.stringify(value) },
          }),
        ].join('\n');
    return {
      process: {
        ...input,
        exitCode: failed ? null : 0,
        timedOut: failed,
        stdout: failed ? '' : stdout,
        stderr: failed ? 'timed out' : '',
      },
      costUsd: invocation.command === 'claude' ? 0.01 : 0,
    };
  };
}

const baseline: RunOnce = () => Promise.resolve({
  ok: true,
  costUsd: 0,
  files: {},
  lastCommit: undefined,
  transcript: 'Verdict: blocked.',
});

describe('mission-team runtime conductor', () => {
  it('uses explicit primitive types for Codex structured-output compatibility', () => {
    expect(SPECIALIST_OUTPUT_SCHEMA.properties.schemaVersion).toMatchObject({
      type: 'integer',
      const: 1,
    });
    expect(SPECIALIST_OUTPUT_SCHEMA.properties.verdict).toMatchObject({
      type: 'string',
    });
  });

  it.each(['claude', 'codex'] as const)(
    'writes the same replayable three-specialist event schema for %s',
    async (runtime) => {
      const outcome = await createMissionTeamRunOnce(
        runtime,
        evalCase(runtime),
        baseline,
        executor(runtime),
      )({ skillBody: 'active ticket-runner' });
      const stream = replayEventLog(outcome.files[MISSION_TEAM_EVENTS] ?? '');

      expect(outcome.ok).toBe(true);
      expect(stream.issues).toEqual([]);
      expect(stream.events.map((event) => [event.source, event.kind])).toEqual([
        [`runtime:${runtime}`, 'specialist.completed'],
        [`runtime:${runtime}`, 'specialist.completed'],
        [`runtime:${runtime}`, 'specialist.completed'],
      ]);
    },
  );

  it('gives each specialist an explicit non-overlapping review lens', async () => {
    const prompts = new Map<string, string>();
    const execute = executor('codex');
    await createMissionTeamRunOnce(
      'codex',
      evalCase('codex'),
      baseline,
      (invocation, cwd, input) => {
        prompts.set(input.specialistId, invocation.args.at(-1) ?? '');
        return execute(invocation, cwd, input);
      },
    )({ skillBody: 'active ticket-runner' });

    expect(prompts.get('core:solution-architect')).toContain(
      'only assigned review lens is architecture',
    );
    expect(prompts.get('core:security-engineer')).toContain(
      'only assigned review lens is security',
    );
    expect(prompts.get('core:test-qa-engineer')).toContain(
      'only assigned review lens is test and QA quality',
    );
    expect([...prompts.values()]).toEqual(expect.arrayContaining([
      expect.stringContaining('other specialists own them'),
    ]));
  });

  it('fails closed and journals a timeout instead of inventing QA completion', async () => {
    const outcome = await createMissionTeamRunOnce(
      'codex',
      evalCase('codex'),
      baseline,
      executor('codex', true),
    )({ skillBody: 'active ticket-runner' });
    const stream = replayEventLog(outcome.files[MISSION_TEAM_EVENTS] ?? '');

    expect(outcome.ok).toBe(false);
    expect(stream.events.at(-1)?.kind).toBe('specialist.failed');
    expect(outcome.transcript).toBe('Verdict: blocked.');
  });

  it('never turns completed degraded reviews into a verified transcript', async () => {
    const outcome = await createMissionTeamRunOnce(
      'codex',
      evalCase('codex'),
      baseline,
      executor('codex', false, true),
    )({ skillBody: 'active ticket-runner' });

    expect(outcome.ok).toBe(true);
    expect(outcome.transcript).toBe('Verdict: blocked.');
  });

  it('uses the baseline only when ticket-runner is absent', async () => {
    const outcome = await createMissionTeamRunOnce(
      'claude',
      evalCase('claude'),
      baseline,
      executor('claude'),
    )({ skillBody: undefined });

    expect(outcome.files[MISSION_TEAM_EVENTS]).toBeUndefined();
  });
});
