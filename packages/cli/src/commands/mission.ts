import { randomUUID } from 'node:crypto';
import type { MissionVerdictStatus } from '@voidcorp/mission-engine';
import { archiveMission, pruneMissions } from '../lib/runs/archive.js';
import { inspectCurrentMission } from '../lib/runs/inspect-current.js';
import { collectKnownSecrets } from '../lib/runs/redact.js';
import {
  createMission,
  type MissionMode,
} from '../lib/runs/store.js';
import { verifyMissionCommand } from '../lib/runs/verify.js';

const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;

interface InvalidArgs {
  readonly kind: 'invalid';
  readonly code: 'MISSION_USAGE';
  readonly problem: string;
  readonly fix: string;
}

export type MissionArgs =
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
  if (subcommand === 'inspect' || subcommand === 'archive') {
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
    'use start, verify, inspect, archive, or prune',
  );
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

function usage(): string {
  return `void-harness mission

  mission start --title <title> [--mode fast|team|fortress] [--json]
  mission verify --id <id> [--shell] [--json] -- <command...>
  mission inspect --id <id> [--json]
  mission archive --id <id> [--json]
  mission prune --older-than <days> [--apply] [--json]

Commands use shell:false. --shell is explicit and accepts one command string.
Prune is a dry-run unless --apply is present.
`;
}

export async function mission(args: readonly string[]): Promise<void> {
  const parsed = parseMissionArgs(args);
  if (parsed.kind === 'help') {
    process.stdout.write(usage());
    return;
  }
  if (parsed.kind === 'invalid') {
    process.stderr.write(
      `${parsed.code}: ${parsed.problem}\nFix: ${parsed.fix}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const root = process.cwd();
  try {
    if (parsed.kind === 'start') {
      const missionId = `mis_${randomUUID()}`;
      await createMission(root, {
        missionId,
        title: parsed.title,
        mode: parsed.mode,
      });
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify({ missionId, mode: parsed.mode })}\n`
          : `${missionId}\n`,
      );
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`MISSION_FAILED: ${message}\n`);
    process.exitCode = 1;
  }
}
