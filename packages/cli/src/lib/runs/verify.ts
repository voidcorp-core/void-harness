import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  canonicalJsonHash,
  sealEvidence,
  type EvidenceOutput,
  type MissionVerdictStatus,
} from '@voidcorp/mission-engine';
import { version } from '../../../package.json';
import {
  collectKnownSecrets,
  redactArgv,
  redactOutput,
} from './redact.js';
import { inspectCurrentMission } from './inspect-current.js';
import { computeProjectState } from './project-state.js';
import { inspectMission, recordMissionEvidence } from './store.js';

const MAX_CAPTURE_BYTES = 64 * 1024;

interface CommandResult {
  readonly exitCode: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly captureTruncated: boolean;
}

export interface VerifyMissionOptions {
  readonly root: string;
  readonly missionId: string;
  readonly command: readonly string[];
  readonly shell: boolean;
  readonly echo: boolean;
}

export interface VerifyMissionResult {
  readonly evidenceId: string;
  readonly exitCode: number;
  readonly verdict: MissionVerdictStatus;
}

function appendBounded(
  chunks: Buffer[],
  chunk: Buffer,
  state: { bytes: number; truncated: boolean },
): void {
  const remaining = MAX_CAPTURE_BYTES - state.bytes;
  if (remaining <= 0) {
    state.truncated = true;
    return;
  }
  chunks.push(chunk.subarray(0, remaining));
  state.bytes += Math.min(chunk.byteLength, remaining);
  if (chunk.byteLength > remaining) state.truncated = true;
}

async function runCommand(
  options: VerifyMissionOptions,
): Promise<CommandResult> {
  const started = new Date();
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const stdoutState = { bytes: 0, truncated: false };
  const stderrState = { bytes: 0, truncated: false };
  const child = options.shell
    ? spawn(options.command[0] ?? '', {
        cwd: options.root,
        env: { ...process.env, VOID_MISSION_ID: options.missionId },
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe'],
      })
    : spawn(options.command[0] ?? '', options.command.slice(1), {
        cwd: options.root,
        env: { ...process.env, VOID_MISSION_ID: options.missionId },
        shell: false,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
  child.stdout.on('data', (raw: Buffer) => {
    appendBounded(stdout, raw, stdoutState);
    if (options.echo) process.stdout.write(raw);
  });
  child.stderr.on('data', (raw: Buffer) => {
    appendBounded(stderr, raw, stderrState);
    if (options.echo) process.stderr.write(raw);
  });
  const exitCode = await new Promise<number>((resolveExit) => {
    let spawnFailed = false;
    child.on('error', (error) => {
      spawnFailed = true;
      const raw = Buffer.from(error.message, 'utf8');
      appendBounded(stderr, raw, stderrState);
      if (options.echo) process.stderr.write(`${error.message}\n`);
    });
    child.on('close', (code, signal) => {
      resolveExit(spawnFailed ? 127 : code ?? (signal === null ? 1 : 128));
    });
  });
  const finished = new Date();
  return {
    exitCode: Math.max(-255, Math.min(255, exitCode)),
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
    captureTruncated: stdoutState.truncated || stderrState.truncated,
  };
}

export async function verifyMissionCommand(
  options: VerifyMissionOptions,
): Promise<VerifyMissionResult> {
  const secrets = collectKnownSecrets();
  const before = await computeProjectState(options.root);
  await inspectMission(
    options.root,
    options.missionId,
    { dependencies: { 'git:working-tree': before.diffHash } },
    { secrets },
  );
  const safeCommand = redactArgv(options.command, secrets);
  const result = await runCommand(options);
  const after = await computeProjectState(options.root);
  const output = redactOutput(result.stdout, result.stderr, secrets);
  const boundedOutput: EvidenceOutput = result.captureTruncated
    ? { ...output, truncated: true }
    : output;
  const environment = {
    runtime: `node:${process.version}`,
    platform: process.platform,
    arch: process.arch,
  };
  const evidence = sealEvidence({
    schemaVersion: 1,
    evidenceId: `evd_${randomUUID()}`,
    missionId: options.missionId,
    type: 'command',
    producer: `void-harness@${version}:mission.verify`,
    source: options.shell
      ? 'shell:explicit'
      : `command:${basename(safeCommand[0] ?? 'unknown').slice(0, 200)}`,
    environment,
    confidence: 'high',
    inputHash: canonicalJsonHash({
      command: safeCommand,
      shell: options.shell,
      environment,
    }),
    diffHash: after.diffHash,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    status: result.exitCode === 0 ? 'passed' : 'failed',
    exitCode: result.exitCode,
    command: safeCommand,
    affectedNodes: after.affectedNodes,
    output: boundedOutput,
    dependencies: [
      {
        kind: 'diff',
        key: 'git:working-tree',
        hash: after.diffHash,
      },
    ],
  });
  await recordMissionEvidence(options.root, evidence);
  const { inspected } = await inspectCurrentMission(
    options.root,
    options.missionId,
    secrets,
  );
  return {
    evidenceId: evidence.evidenceId,
    exitCode: result.exitCode,
    verdict: inspected.verdict.status,
  };
}
