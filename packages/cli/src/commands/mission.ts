import { execFile as nodeExecFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  compileMissionPlan,
  classifyRisk,
  mergePolicies,
  selectMissionMode,
  type MissionPlan,
  type MissionVerdictStatus,
  type RecoveryDecision,
} from '@voidcorp/mission-engine';
import { findCoreSource } from '../lib/paths.js';
import { loadProjectPolicies } from '../lib/policy-loader.js';
import { loadProfiles } from '../lib/profile-loader.js';
import { loadSpecialists } from '../lib/specialists/load.js';
import { archiveMission, pruneMissions } from '../lib/runs/archive.js';
import { inspectCurrentMission } from '../lib/runs/inspect-current.js';
import { collectKnownSecrets } from '../lib/runs/redact.js';
import {
  createMission,
  resumeMission,
  type MissionMode,
} from '../lib/runs/store.js';
import { verifyMissionCommand } from '../lib/runs/verify.js';
import { detectProfileInput, detectStack } from '../lib/stack.js';

const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
const execFile = promisify(nodeExecFile);
const MAX_TICKET_BYTES = 100_000;

interface InvalidArgs {
  readonly kind: 'invalid';
  readonly code: 'MISSION_USAGE';
  readonly problem: string;
  readonly fix: string;
}

export type MissionArgs =
  | {
      readonly kind: 'plan';
      readonly ticketPath: string;
      readonly json: boolean;
    }
  | {
      readonly kind: 'start';
      readonly title: string;
      readonly mode: MissionMode;
      readonly json: boolean;
    }
  | {
      readonly kind: 'verify';
      readonly missionId: string;
      readonly shell: boolean;
      readonly command: readonly string[];
      readonly json: boolean;
    }
  | {
      readonly kind: 'inspect';
      readonly missionId: string;
      readonly json: boolean;
    }
  | {
      readonly kind: 'resume';
      readonly missionId: string;
      readonly json: boolean;
    }
  | {
      readonly kind: 'archive';
      readonly missionId: string;
      readonly json: boolean;
    }
  | {
      readonly kind: 'prune';
      readonly olderThanDays: number;
      readonly apply: boolean;
      readonly json: boolean;
    }
  | { readonly kind: 'help' }
  | InvalidArgs;

function invalid(problem: string, fix: string): InvalidArgs {
  return { kind: 'invalid', code: 'MISSION_USAGE', problem, fix };
}

function valueAfter(
  args: readonly string[],
  option: string,
): string | undefined {
  const index = args.indexOf(option);
  return index === -1 ? undefined : args[index + 1];
}

function validateOptions(
  args: readonly string[],
  valueOptions: readonly string[],
  booleanOptions: readonly string[],
): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? '';
    if (valueOptions.includes(token)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return `missing value for ${token}`;
      }
      index += 1;
      continue;
    }
    if (booleanOptions.includes(token)) continue;
    return `unknown option '${token}'`;
  }
  return undefined;
}

function missionIdFrom(options: readonly string[]): string | InvalidArgs {
  const missionId = valueAfter(options, '--id');
  if (missionId === undefined) {
    return invalid('missing required option --id', 'pass --id mis_<opaque-id>');
  }
  if (!MISSION_ID.test(missionId)) {
    return invalid('invalid mission ID', 'pass the ID returned by mission start');
  }
  return missionId;
}

export function parseMissionArgs(args: readonly string[]): MissionArgs {
  const [subcommand] = args;
  const divider = args.indexOf('--');
  const options = args.slice(1, divider === -1 ? undefined : divider);
  if (
    subcommand === undefined
    || subcommand === 'help'
    || subcommand === '--help'
    || options.includes('--help')
  ) {
    return { kind: 'help' };
  }
  const command = divider === -1 ? [] : args.slice(divider + 1);
  if (subcommand === 'start') {
    if (divider !== -1) {
      return invalid('start does not accept a command', 'remove the -- separator');
    }
    const optionError = validateOptions(
      options,
      ['--title', '--mode'],
      ['--json'],
    );
    if (optionError !== undefined) {
      return invalid(optionError, 'void-harness mission start --help');
    }
    const title = valueAfter(options, '--title')?.trim();
    if (
      title === undefined
      || title === ''
      || title.length > 200
      || [...title].some((character) => {
        const point = character.codePointAt(0) ?? 0;
        return point < 0x20 || point === 0x7f;
      })
    ) {
      return invalid(
        'title must contain 1 to 200 characters',
        'pass --title <title>',
      );
    }
    const mode = valueAfter(options, '--mode') ?? 'team';
    if (mode !== 'fast' && mode !== 'team' && mode !== 'fortress') {
      return invalid(
        `invalid mode '${mode}'`,
        'use --mode fast|team|fortress',
      );
    }
    return {
      kind: 'start',
      title,
      mode,
      json: options.includes('--json'),
    };
  }
  if (subcommand === 'plan') {
    if (divider !== -1) {
      return invalid('plan does not accept a command', 'remove the -- separator');
    }
    const optionError = validateOptions(options, ['--ticket'], ['--json']);
    if (optionError !== undefined) {
      return invalid(optionError, 'void-harness mission plan --help');
    }
    const ticketPath = valueAfter(options, '--ticket');
    if (ticketPath === undefined) {
      return invalid(
        'missing required option --ticket',
        'pass --ticket <markdown-file>',
      );
    }
    return { kind: 'plan', ticketPath, json: options.includes('--json') };
  }
  if (subcommand === 'verify') {
    const optionError = validateOptions(
      options,
      ['--id'],
      ['--shell', '--json'],
    );
    if (optionError !== undefined) {
      return invalid(optionError, 'void-harness mission verify --help');
    }
    const missionId = missionIdFrom(options);
    if (typeof missionId !== 'string') return missionId;
    if (divider === -1 || command.length === 0) {
      return invalid(
        'verify requires a command after --',
        'void-harness mission verify --id <id> -- <command...>',
      );
    }
    const shell = options.includes('--shell');
    if (shell && command.length !== 1) {
      return invalid(
        '--shell requires exactly one explicit command string',
        "pass --shell -- 'command && next-command'",
      );
    }
    return {
      kind: 'verify',
      missionId,
      shell,
      command,
      json: options.includes('--json'),
    };
  }
  if (subcommand === 'inspect' || subcommand === 'archive' || subcommand === 'resume') {
    if (divider !== -1) {
      return invalid(
        `${subcommand} does not accept a command`,
        `void-harness mission ${subcommand} --id <id>`,
      );
    }
    const optionError = validateOptions(options, ['--id'], ['--json']);
    if (optionError !== undefined) {
      return invalid(optionError, `void-harness mission ${subcommand} --help`);
    }
    const missionId = missionIdFrom(options);
    if (typeof missionId !== 'string') return missionId;
    return {
      kind: subcommand,
      missionId,
      json: options.includes('--json'),
    };
  }
  if (subcommand === 'prune') {
    if (divider !== -1) {
      return invalid('prune does not accept a command', 'remove the -- separator');
    }
    const optionError = validateOptions(
      options,
      ['--older-than'],
      ['--apply', '--json'],
    );
    if (optionError !== undefined) {
      return invalid(optionError, 'void-harness mission prune --help');
    }
    const rawDays = valueAfter(options, '--older-than');
    const olderThanDays = rawDays === undefined ? Number.NaN : Number(rawDays);
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
      return invalid(
        '--older-than must be a positive integer',
        'pass --older-than <days>',
      );
    }
    return {
      kind: 'prune',
      olderThanDays,
      apply: options.includes('--apply'),
      json: options.includes('--json'),
    };
  }
  return invalid(
    `unknown mission subcommand '${subcommand}'`,
    'use plan, start, resume, verify, inspect, archive, or prune',
  );
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

async function readTicket(root: string, ticketPath: string): Promise<{
  readonly id: string;
  readonly title: string;
  readonly body: string;
}> {
  const canonicalRoot = await realpath(resolve(root));
  const canonicalTicket = await realpath(resolve(canonicalRoot, ticketPath));
  if (!isWithin(canonicalRoot, canonicalTicket)) {
    throw new Error('MISSION_TICKET_PATH_ESCAPE: ticket resolves outside project root');
  }
  const metadata = await stat(canonicalTicket);
  if (!metadata.isFile() || metadata.size > MAX_TICKET_BYTES) {
    throw new Error(
      `MISSION_TICKET_INVALID: ticket must be a file under ${MAX_TICKET_BYTES} bytes`,
    );
  }
  const body = await readFile(canonicalTicket, 'utf8');
  if (body.trim() === '') throw new Error('MISSION_TICKET_INVALID: ticket is empty');
  const heading = body.split('\n').find((line) => /^#\s+\S/.test(line));
  const fallback = basename(canonicalTicket, extname(canonicalTicket));
  return Object.freeze({
    id: fallback.slice(0, 128),
    title: (heading?.replace(/^#\s+/, '').trim() ?? fallback).slice(0, 200),
    body,
  });
}

interface DetectedFiles {
  readonly files: readonly string[];
  readonly status: 'known' | 'unknown';
}

async function gitFiles(root: string): Promise<DetectedFiles> {
  try {
    const options = { cwd: root, encoding: 'utf8' as const, maxBuffer: 1_000_000, timeout: 5_000 };
    const [changed, untracked] = await Promise.all([
      execFile('git', ['diff', '--name-only', '--relative', 'HEAD'], options),
      execFile('git', ['ls-files', '--others', '--exclude-standard'], options),
    ]);
    return Object.freeze({
      files: Object.freeze(
        [...new Set(`${changed.stdout}\n${untracked.stdout}`.split('\n').filter(Boolean))].sort(),
      ),
      status: 'known',
    });
  } catch {
    return Object.freeze({ files: Object.freeze([]), status: 'unknown' });
  }
}

function detectedStack(root: string, profileInput: ReturnType<typeof detectProfileInput>): {
  readonly technologies: readonly string[];
  readonly status: 'known' | 'unknown';
} {
  const markers = [
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
  ];
  if (!markers.some((marker) => existsSync(join(root, marker)))) {
    return Object.freeze({ technologies: Object.freeze([]), status: 'unknown' });
  }
  const stack = detectStack(root);
  return Object.freeze({
    technologies: Object.freeze([...new Set([
      ...Object.values(stack),
      ...profileInput.projects.flatMap((project) =>
        project.technologies.map((technology) => technology.id)),
    ])].sort()),
    status: 'known',
  });
}

export async function planMission(
  root: string,
  ticketPath: string,
  generatedAt = new Date().toISOString(),
): Promise<MissionPlan> {
  const [ticket, coreRoot, diff] = await Promise.all([
    readTicket(root, ticketPath),
    findCoreSource(),
    gitFiles(root),
  ]);
  const [policies, profiles, specialists] = await Promise.all([
    loadProjectPolicies(root, join(coreRoot, 'policies')),
    loadProfiles(root, join(coreRoot, 'profiles')),
    loadSpecialists(coreRoot),
  ]);
  const profileInput = detectProfileInput(root, diff.files);
  const stack = detectedStack(root, profileInput);
  return compileMissionPlan({
    schemaVersion: 2,
    ticket,
    diff,
    stack,
    policy: mergePolicies(policies, generatedAt),
    profiles: {
      catalog: profiles,
      input: profileInput,
    },
    specialists: { catalog: specialists },
  }, { generatedAt });
}

function renderPlan(plan: MissionPlan): string {
  const applicable = plan.applicability.filter((item) => item.state === 'pending').length;
  const specialists = plan.specialists.filter((item) => item.state === 'applicable').length;
  return [
    `${plan.ticketId} risk=${plan.risk.level} mode=${plan.risk.requiredMode}`,
    `passes applicable=${applicable} total=${plan.applicability.length}`,
    `specialists applicable=${specialists} total=${plan.specialists.length}`,
    `plan ${plan.planHash}`,
  ].join('\n');
}

function renderInspection(
  inspected: Awaited<ReturnType<typeof inspectCurrentMission>>['inspected'],
): string {
  const verdict = inspected.verdict;
  return [
    `${verdict.missionId} ${verdict.status}`,
    `${verdict.title} (${verdict.mode})`,
    `evidence fresh=${verdict.freshEvidence} stale=${verdict.staleEvidence} tampered=${verdict.tamperedEvidence}`,
    `blockers=${verdict.openBlockers} exceptions=${verdict.acceptedExceptions}`,
    ...verdict.reasons.map((reason) => `- ${reason}`),
  ].join('\n');
}

export function missionVerdictExitCode(
  status: MissionVerdictStatus,
): 0 | 1 {
  return status === 'verified' || status === 'shipped-with-exception' ? 0 : 1;
}

export function missionRecoveryExitCode(
  status: RecoveryDecision['status'],
): 0 | 1 {
  return status === 'active' || status === 'complete' ? 0 : 1;
}

function usage(): string {
  return `void-harness mission

  mission start --title <title> [--mode fast|team|fortress] [--json]
  mission plan --ticket <markdown-file> [--json]
  mission verify --id <id> [--shell] [--json] -- <command...>
  mission resume --id <id> [--json]
  mission inspect --id <id> [--json]
  mission archive --id <id> [--json]
  mission prune --older-than <days> [--apply] [--json]

Commands use shell:false. --shell is explicit and accepts one command string.
Prune is a dry-run unless --apply is present.
`;
}

interface MissionFailure {
  readonly code: string;
  readonly problem: string;
  readonly cause: string;
  readonly fix: string;
}

function missionFailure(error: unknown): MissionFailure {
  const message = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z][A-Z0-9_]+):\s*(.*)$/s.exec(message);
  return Object.freeze({
    code: match?.[1] ?? 'MISSION_FAILED',
    problem: 'mission command could not complete',
    cause: match?.[2] ?? message,
    fix: 'correct the reported input or policy and retry',
  });
}

export function renderMissionFailure(error: unknown, json: boolean): string {
  const failure = missionFailure(error);
  if (json) return `${JSON.stringify({ error: failure })}\n`;
  return `${failure.code}: ${failure.problem}\n`
    + `Cause: ${failure.cause}\n`
    + `Fix: ${failure.fix}.\n`;
}

export async function mission(args: readonly string[]): Promise<void> {
  const parsed = parseMissionArgs(args);
  if (parsed.kind === 'help') {
    process.stdout.write(usage());
    return;
  }
  if (parsed.kind === 'invalid') {
    if (args.includes('--json')) {
      process.stderr.write(`${JSON.stringify({
        error: {
          code: parsed.code,
          problem: parsed.problem,
          cause: 'arguments did not satisfy the mission command contract',
          fix: parsed.fix,
        },
      })}\n`);
    } else {
      process.stderr.write(
        `${parsed.code}: ${parsed.problem}\nFix: ${parsed.fix}\n`,
      );
    }
    process.exitCode = 2;
    return;
  }
  const root = process.cwd();
  try {
    if (parsed.kind === 'plan') {
      const plan = await planMission(root, parsed.ticketPath);
      process.stdout.write(parsed.json ? `${JSON.stringify(plan)}\n` : `${renderPlan(plan)}\n`);
      return;
    }
    if (parsed.kind === 'start') {
      const diff = await gitFiles(root);
      const stack = detectedStack(root, detectProfileInput(root, diff.files));
      const selection = selectMissionMode(classifyRisk({
        ticket: parsed.title,
        files: diff.files,
        stack: stack.technologies,
        complete: diff.status === 'known' && stack.status === 'known',
      }), parsed.mode);
      const missionId = `mis_${randomUUID()}`;
      await createMission(root, {
        missionId,
        title: parsed.title,
        mode: selection.effectiveMode,
        requestedMode: selection.requestedMode,
        ...(selection.promotion === undefined
          ? {}
          : { promotionReason: selection.promotion.reason }),
      });
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify({ missionId, ...selection })}\n`
          : `${missionId}\n${selection.promotion === undefined
            ? ''
            : `mode ${selection.requestedMode} -> ${selection.effectiveMode}\n`}`,
      );
      return;
    }
    if (parsed.kind === 'resume') {
      const resumed = await resumeMission(root, parsed.missionId);
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify(resumed)}\n`
          : `${resumed.decision.status}: ${resumed.decision.action.kind}\n`,
      );
      process.exitCode = missionRecoveryExitCode(resumed.decision.status);
      return;
    }
    if (parsed.kind === 'prune') {
      const candidates = await pruneMissions(
        root,
        parsed.olderThanDays,
        parsed.apply,
      );
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify({ apply: parsed.apply, candidates })}\n`
          : `${parsed.apply ? 'deleted' : 'dry-run'}: ${candidates.length} run(s)\n`
            + candidates.map((item) => `${item.missionId} ${item.path}`).join('\n')
            + (candidates.length === 0 ? '' : '\n'),
      );
      return;
    }
    if (parsed.kind === 'inspect') {
      const { inspected } = await inspectCurrentMission(
        root,
        parsed.missionId,
        collectKnownSecrets(),
      );
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify(inspected.verdict)}\n`
          : `${renderInspection(inspected)}\n`,
      );
      process.exitCode = missionVerdictExitCode(inspected.verdict.status);
      return;
    }
    if (parsed.kind === 'archive') {
      const { project } = await inspectCurrentMission(
        root,
        parsed.missionId,
        collectKnownSecrets(),
      );
      const archived = await archiveMission(root, parsed.missionId, {
        dependencies: { 'git:working-tree': project.diffHash },
      });
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify(archived)}\n`
          : `${archived.path}\n`,
      );
      return;
    }
    const result = await verifyMissionCommand({
      root,
      missionId: parsed.missionId,
      command: parsed.command,
      shell: parsed.shell,
      echo: !parsed.json,
    });
    process.stdout.write(
      parsed.json
        ? `${JSON.stringify({
            evidenceId: result.evidenceId,
            exitCode: result.exitCode,
            verdict: result.verdict,
          })}\n`
        : `evidence ${result.evidenceId}: ${result.verdict}\n`,
    );
    process.exitCode = result.exitCode !== 0
      ? result.exitCode
      : missionVerdictExitCode(result.verdict);
  } catch (error) {
    process.stderr.write(renderMissionFailure(error, parsed.json));
    process.exitCode = 1;
  }
}
