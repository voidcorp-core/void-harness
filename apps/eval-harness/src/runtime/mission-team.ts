import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  parseEvent,
  serializeEvent,
  type CanonicalEvent,
  type JsonValue,
} from '@voidcorp/mission-engine/events';
import { MISSION_TEAM_EVENTS } from '../cases/mission-team.js';
import { collectFiles, setupSandbox } from '../sandbox.js';
import type { EvalCase, RunOnce, RunOutcome } from '../types.js';
import type { EvalRuntime } from '../cli-args.js';
import {
  buildClaudeSpecialistInvocation,
  parseClaudeSpecialistRun,
} from './claude.js';
import {
  buildCodexSpecialistInvocation,
  codexAgentInstructions,
  parseCodexSpecialistRun,
} from './codex.js';
import {
  executeSpecialist,
  type ExecuteSpecialist,
} from './process.js';
import type { SpecialistEventDraft } from './types.js';

const MISSION_ID = 'mis_mission_team_eval_0001';
const SPECIALISTS = [
  { id: 'core:solution-architect', name: 'solution-architect' },
  { id: 'core:security-engineer', name: 'security-engineer' },
  { id: 'core:test-qa-engineer', name: 'test-qa-engineer' },
] as const;
const OUTPUT_SCHEMA_PATH = '.void/eval/specialist-output.schema.json';

export const SPECIALIST_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'specialistId',
    'contractVersion',
    'completionId',
    'verdict',
    'findings',
    'evidenceRequests',
    'limitations',
  ],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    specialistId: { type: 'string', pattern: '^core:[a-z0-9]+(?:-[a-z0-9]+)*$' },
    contractVersion: { type: 'integer', const: 2 },
    completionId: { type: 'string', minLength: 8, maxLength: 160 },
    verdict: {
      type: 'string',
      enum: ['pass', 'changes-requested', 'blocked', 'degraded'],
    },
    findings: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'severity', 'summary', 'evidence', 'recommendation'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            maxLength: 80,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
          },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 16,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['path', 'line', 'detail'],
              properties: {
                path: { type: 'string', minLength: 1, maxLength: 500 },
                line: { type: 'integer', minimum: 1, maximum: 10_000_000 },
                detail: { type: 'string', minLength: 1, maxLength: 1_000 },
              },
            },
          },
          recommendation: { type: 'string', minLength: 1, maxLength: 1_000 },
        },
      },
    },
    evidenceRequests: {
      type: 'array',
      maxItems: 16,
      items: { type: 'string', minLength: 1, maxLength: 1_000 },
    },
    limitations: {
      type: 'array',
      maxItems: 16,
      items: { type: 'string', minLength: 1, maxLength: 1_000 },
    },
  },
} as const;

function fixtureHash(fixture: Readonly<Record<string, string>>): string {
  const source = Object.entries(fixture)
    .filter(([path]) => !path.startsWith('.claude/') && !path.startsWith('.codex/'))
    .sort(([left], [right]) => left.localeCompare(right));
  return `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}

function roleFocus(name: string): string {
  if (name === 'solution-architect') {
    return [
      'Your only assigned review lens is architecture.',
      'Inspect src/domain/order.ts and trace its import direction against domain independence.',
      'Do not report authorization, exploitability, or test-coverage findings; other specialists own them.',
    ].join(' ');
  }
  if (name === 'security-engineer') {
    return [
      'Your only assigned review lens is security.',
      'Inspect src/auth.ts and trace claimedRole from its trust boundary to the access decision.',
      'Do not report architecture or general test-coverage findings; other specialists own them.',
    ].join(' ');
  }
  return [
    'Your only assigned review lens is test and QA quality.',
    'Compare src/discount.ts with src/discount.test.ts.',
    'Map regular and admin implementation branches to existing regression tests.',
    'Do not report security or architecture findings; other specialists own them.',
  ].join(' ');
}

function prompt(ticket: string, name: string): string {
  return [
    ticket,
    'Review it against the current repository in your bounded specialist scope.',
    roleFocus(name),
    'Return findings and evidence requests only for that assigned lens.',
    'Inspect the implementation and tests directly. Do not edit files or delegate.',
    'Return the required structured completion with concrete repository-relative evidence.',
  ].join(' ');
}

function invocation(
  runtime: EvalRuntime,
  dir: string,
  name: string,
  ticket: string,
) {
  if (runtime === 'claude') {
    return buildClaudeSpecialistInvocation({
      specialistName: name,
      prompt: prompt(ticket, name),
      outputSchema: SPECIALIST_OUTPUT_SCHEMA,
    });
  }
  const agent = readFileSync(join(dir, `.codex/agents/${name}.toml`), 'utf8');
  return buildCodexSpecialistInvocation({
    specialistName: name,
    prompt: prompt(ticket, name),
    outputSchemaPath: join(dir, OUTPUT_SCHEMA_PATH),
    developerInstructions: codexAgentInstructions(agent, name),
  });
}

function canonicalEvent(
  draft: SpecialistEventDraft,
  seq: number,
): CanonicalEvent {
  const candidate = {
    schemaVersion: 1,
    seq,
    eventId: `evt_mission_team_${String(seq).padStart(8, '0')}`,
    missionId: MISSION_ID,
    ts: '2026-07-26T12:00:00.000Z',
    source: draft.source,
    kind: draft.kind,
    subject: draft.subject,
    correlationId: MISSION_ID,
    payload: {
      ...(draft.payload as unknown as Readonly<Record<string, JsonValue>>),
      stage: 'post-implementation',
    },
  };
  const parsed = parseEvent(candidate);
  if (!parsed.ok) throw new Error(`mission-team event is not replayable: ${parsed.issue.message}`);
  return parsed.value;
}

function runSpecialists(
  runtime: EvalRuntime,
  dir: string,
  hash: string,
  ticket: string,
  execute: ExecuteSpecialist,
): { readonly events: readonly CanonicalEvent[]; readonly costUsd: number } {
  const events: CanonicalEvent[] = [];
  let costUsd = 0;
  for (const [index, specialist] of SPECIALISTS.entries()) {
    const result = execute(invocation(runtime, dir, specialist.name, ticket), dir, {
      specialistId: specialist.id,
      reviewRound: 1,
      inputHash: hash,
      correlationId: MISSION_ID,
    });
    costUsd += result.costUsd;
    const draft = runtime === 'claude'
      ? parseClaudeSpecialistRun(result.process)
      : parseCodexSpecialistRun(result.process);
    events.push(canonicalEvent(draft, index + 1));
  }
  return { events, costUsd };
}

function teamOutcome(
  runtime: EvalRuntime,
  evalCase: EvalCase,
  execute: ExecuteSpecialist,
): RunOutcome {
  const { dir } = setupSandbox(evalCase.fixture);
  try {
    const schemaPath = join(dir, OUTPUT_SCHEMA_PATH);
    mkdirSync(dirname(schemaPath), { recursive: true });
    writeFileSync(schemaPath, `${JSON.stringify(SPECIALIST_OUTPUT_SCHEMA, null, 2)}\n`);
    const result = runSpecialists(
      runtime,
      dir,
      fixtureHash(evalCase.fixture),
      evalCase.prompt,
      execute,
    );
    const eventLog = `${result.events.map(serializeEvent).join('\n')}\n`;
    writeFileSync(join(dir, MISSION_TEAM_EVENTS), eventLog);
    const completed = result.events.every((event) => event.kind === 'specialist.completed');
    const requestsCorrection = result.events.some((event) => {
      const payload = event.payload as { completion?: { findings?: readonly unknown[] } };
      const completion = payload.completion as {
        readonly findings?: readonly unknown[];
        readonly verdict?: string;
      } | undefined;
      return (completion?.findings?.length ?? 0) > 0 || completion?.verdict !== 'pass';
    });
    return {
      ok: completed,
      costUsd: result.costUsd,
      files: collectFiles(dir),
      lastCommit: undefined,
      transcript: `Verdict: ${completed && !requestsCorrection ? 'verified' : 'blocked'}.`,
      eventLog,
      ...(completed ? {} : { error: 'one or more required specialists failed' }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function createMissionTeamRunOnce(
  runtime: EvalRuntime,
  evalCase: EvalCase,
  baseline: RunOnce,
  execute: ExecuteSpecialist = executeSpecialist,
): RunOnce {
  return (options) => options.skillBody === undefined
    ? baseline(options)
    : Promise.resolve(teamOutcome(runtime, evalCase, execute));
}
