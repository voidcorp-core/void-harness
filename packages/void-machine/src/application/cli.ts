// tdd-cover: e2e packages/void-machine/test/cli-note-contract.test.ts
import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { renderDoctorJson, renderDoctorText } from '../adapters/formats/doctor-report.js';
import { inspectDoctor } from './doctor.js';
import { runClaudeNote, type RuntimeNoteUsage } from './runtime-note.js';

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

async function note(args: readonly string[]): Promise<void> {
  const inputPath = option(args, '--input');
  const cwd = option(args, '--cwd');
  const extractionModel = option(args, '--extraction-model');
  const synthesisModel = option(args, '--synthesis-model');
  const timeoutText = option(args, '--timeout-ms');
  const executable = option(args, '--executable') ?? 'claude';
  if (inputPath === undefined || cwd === undefined || extractionModel === undefined
    || synthesisModel === undefined || timeoutText === undefined) {
    process.stderr.write('usage: void-machine note --input <path> --cwd <path> --extraction-model <model> --synthesis-model <model> --timeout-ms <ms> [--executable <path>]\n');
    process.exitCode = 2;
    return;
  }
  const timeoutMs = Number(timeoutText);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    process.stderr.write('invalid --timeout-ms: provide a positive integer\n');
    process.exitCode = 2;
    return;
  }
  let raw: unknown;
  try {
    const metadata = await stat(inputPath);
    if (!metadata.isFile() || metadata.size > 262_144) throw new Error('input too large');
    const text = await readFile(inputPath, 'utf8');
    raw = JSON.parse(text) as unknown;
  } catch {
    process.stderr.write('unable to read or parse the note input file\n');
    process.exitCode = 2;
    return;
  }
  const usage: RuntimeNoteUsage[] = [];
  const outcome = await runClaudeNote(raw, {
    executable, cwd, env: safeEnvironment(), extractionModel, synthesisModel, timeoutMs,
    onUsage: (value) => { usage.push(value); },
  });
  process.stdout.write(`${JSON.stringify({ ...outcome, usage })}\n`);
  if (outcome.kind === 'stopped') process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
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
