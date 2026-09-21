// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { renderDoctorJson, renderDoctorText } from '../adapters/formats/doctor-report.js';
import { MISSION_ID_PATTERN } from '../adapters/store/file-journal.js';
import { inspectDoctor } from './doctor.js';
import { type MissionReceipt, resumeNoteMission, startNoteMission } from './note-mission.js';
import { claudeMissionDependencies, runClaudeNote, type RuntimeNoteUsage } from './runtime-note.js';

const safeEnvironment = (): NodeJS.ProcessEnv => {
  const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ'];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }));
};

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function usageError(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

function parseTimeout(text: string): number | undefined {
  const timeoutMs = Number(text);
  if (Number.isSafeInteger(timeoutMs) && timeoutMs >= 1) return timeoutMs;
  usageError('invalid --timeout-ms: provide a positive integer');
  return undefined;
}

type Input = { readonly kind: 'read'; readonly value: unknown } | { readonly kind: 'unreadable' };

async function readInput(inputPath: string): Promise<Input> {
  try {
    const metadata = await stat(inputPath);
    if (!metadata.isFile() || metadata.size > 262_144) throw new Error('input too large');
    return { kind: 'read', value: JSON.parse(await readFile(inputPath, 'utf8')) as unknown };
  } catch {
    usageError('unable to read or parse the note input file');
    return { kind: 'unreadable' };
  }
}

function deliver(receipt: MissionReceipt): void {
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.kind === 'stopped' ? 1 : receipt.kind === 'blocked' ? 3 : 0;
}

const START_USAGE = 'usage: void-machine note start --store <dir> --mission <id> --input <path> --cwd <path> --extraction-model <model> --synthesis-model <model> --timeout-ms <ms> [--executable <path>] [--stop-after extraction]';
const RESUME_USAGE = 'usage: void-machine note resume --store <dir> --mission <id> --cwd <path> [--executable <path>]';

async function noteStart(args: readonly string[]): Promise<void> {
  const store = option(args, '--store');
  const missionId = option(args, '--mission');
  const inputPath = option(args, '--input');
  const cwd = option(args, '--cwd');
  const extractionModel = option(args, '--extraction-model');
  const synthesisModel = option(args, '--synthesis-model');
  const timeoutText = option(args, '--timeout-ms');
  const stopAfter = option(args, '--stop-after');
  if (store === undefined || missionId === undefined || !MISSION_ID_PATTERN.test(missionId)
    || inputPath === undefined || cwd === undefined || extractionModel === undefined
    || synthesisModel === undefined || timeoutText === undefined
    || (args.includes('--stop-after') && stopAfter !== 'extraction')) {
    usageError(START_USAGE);
    return;
  }
  const timeoutMs = parseTimeout(timeoutText);
  if (timeoutMs === undefined) return;
  const raw = await readInput(inputPath);
  if (raw.kind === 'unreadable') return;
  const context = claudeMissionDependencies({ executable: option(args, '--executable') ?? 'claude',
    cwd, env: safeEnvironment(), store, missionId });
  deliver(await startNoteMission(raw.value, { extractionModel, synthesisModel, timeoutMs }, context,
    stopAfter === 'extraction' ? 'extraction' : undefined));
}

async function noteResume(args: readonly string[]): Promise<void> {
  const store = option(args, '--store');
  const missionId = option(args, '--mission');
  const cwd = option(args, '--cwd');
  if (store === undefined || missionId === undefined || !MISSION_ID_PATTERN.test(missionId) || cwd === undefined) {
    usageError(RESUME_USAGE);
    return;
  }
  deliver(await resumeNoteMission(claudeMissionDependencies({
    executable: option(args, '--executable') ?? 'claude', cwd, env: safeEnvironment(), store, missionId,
  })));
}

async function note(args: readonly string[]): Promise<void> {
  const inputPath = option(args, '--input');
  const cwd = option(args, '--cwd');
  const extractionModel = option(args, '--extraction-model');
  const synthesisModel = option(args, '--synthesis-model');
  const timeoutText = option(args, '--timeout-ms');
  const executable = option(args, '--executable') ?? 'claude';
  if (inputPath === undefined || cwd === undefined || extractionModel === undefined
    || synthesisModel === undefined || timeoutText === undefined) {
    usageError('usage: void-machine note --input <path> --cwd <path> --extraction-model <model> --synthesis-model <model> --timeout-ms <ms> [--executable <path>]');
    return;
  }
  const timeoutMs = parseTimeout(timeoutText);
  if (timeoutMs === undefined) return;
  const raw = await readInput(inputPath);
  if (raw.kind === 'unreadable') return;
  const usage: RuntimeNoteUsage[] = [];
  const outcome = await runClaudeNote(raw.value, {
    executable, cwd, env: safeEnvironment(), extractionModel, synthesisModel, timeoutMs,
    onUsage: (value) => { usage.push(value); },
  });
  process.stdout.write(`${JSON.stringify({ ...outcome, usage })}\n`);
  if (outcome.kind === 'stopped') process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === 'note' && args[1] === 'start') {
    await noteStart(args.slice(2));
    return;
  }
  if (args[0] === 'note' && args[1] === 'resume') {
    await noteResume(args.slice(2));
    return;
  }
  if (args[0] === 'note') {
    await note(args.slice(1));
    return;
  }
  if (args[0] !== 'doctor' || args.length > 2
    || (args.length === 2 && args[1] !== '--json')) {
    process.stderr.write('usage: void-machine doctor [--json]\n');
    process.exitCode = 2;
    return;
  }
  // Node exposes a special environment object; Zod records require a plain object.
  // Snapshot at the executable edge, then validate every value unchanged.
  const environment = z.record(z.string(), z.string().optional()).parse({ ...process.env });
  const report = inspectDoctor({ cwd: process.cwd(), environment });
  const output = args[1] === '--json' ? renderDoctorJson(report) : renderDoctorText(report);
  process.stdout.write(`${output}\n`);
  process.exitCode = report.health === 'healthy' ? 0 : 1;
}

void main().catch(() => {
  process.stderr.write('void-machine failed before producing a result\n');
  process.exitCode = 1;
});
