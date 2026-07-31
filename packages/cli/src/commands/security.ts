// `void-harness security` — the local security baseline, and the gate that
// stands in front of anything aimed at a host.
//
// Everything is an argument. A security command that stops to ask a question
// cannot run in CI, which is where it matters most; and a prompt is a place a
// target can be widened without leaving a trace.
//
// The command owns I/O and rendering only. What may run is decided by
// `planSecurityScan`, and what a result is worth by the mission engine, so both
// stay provable without a network.

import { execFile as nodeExecFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  describeSecurityPosture,
  judgeScan,
  type ScanCompleteness,
  type ScopeAuthorization,
  type SecurityPosture,
} from '@voidcorp/mission-engine';
import { findCoreSource } from '../lib/paths.js';
import { loadSecurityManifest, type SecurityAdapter } from '../lib/security/manifest.js';
import { planSecurityScan, type ScanPlan } from '../lib/security/plan.js';

const execFile = promisify(nodeExecFile);
const MAX_AUTHORIZATION_BYTES = 16 * 1024;
const DETECT_TIMEOUT_MS = 60_000;

export type SecurityArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'adapters'; readonly json: boolean }
  | {
      readonly kind: 'scan';
      readonly target?: string;
      readonly authorizationPath?: string;
      readonly mode: 'fast' | 'team' | 'fortress';
      readonly prelaunch: boolean;
      readonly offline: boolean;
      readonly json: boolean;
    }
  | {
      readonly kind: 'invalid';
      readonly code: 'SECURITY_USAGE';
      readonly problem: string;
      readonly fix: string;
    };

const VALUE_OPTIONS = ['--target', '--authorization', '--mode'];
const FLAG_OPTIONS = ['--json', '--prelaunch', '--offline'];

function invalid(problem: string, fix: string): SecurityArgs {
  return { kind: 'invalid', code: 'SECURITY_USAGE', problem, fix };
}

function valueAfter(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) return undefined;
  return value;
}

function unknownOption(options: readonly string[]): string | undefined {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index] as string;
    if (!option.startsWith('--')) continue;
    if (FLAG_OPTIONS.includes(option)) continue;
    if (VALUE_OPTIONS.includes(option)) {
      index += 1;
      continue;
    }
    return option;
  }
  return undefined;
}

export function parseSecurityArgs(args: readonly string[]): SecurityArgs {
  const [subcommand] = args;
  const options = args.slice(1);
  if (
    subcommand === undefined
    || subcommand === 'help'
    || subcommand === '--help'
    || options.includes('--help')
  ) {
    return { kind: 'help' };
  }
  if (subcommand !== 'adapters' && subcommand !== 'scan') {
    return invalid(`unknown subcommand '${subcommand}'`, 'use adapters or scan');
  }
  const unknown = unknownOption(options);
  if (unknown !== undefined) return invalid(`unknown option '${unknown}'`, 'void-harness security --help');

  const json = options.includes('--json');
  if (subcommand === 'adapters') return { kind: 'adapters', json };

  for (const option of VALUE_OPTIONS) {
    if (options.includes(option) && valueAfter(options, option) === undefined) {
      return invalid(`${option} was given no value`, `pass ${option} <value>`);
    }
  }
  const mode = valueAfter(options, '--mode') ?? 'team';
  if (mode !== 'fast' && mode !== 'team' && mode !== 'fortress') {
    return invalid(
      `invalid mode '${mode}'`,
      mode === 'prelaunch'
        ? 'pre-launch is a phase, not a mode: use --mode fast|team|fortress with --prelaunch'
        : 'use --mode fast|team|fortress',
    );
  }
  const target = valueAfter(options, '--target');
  const authorizationPath = valueAfter(options, '--authorization');
  if (authorizationPath !== undefined && target === undefined) {
    // An authorization names hosts. With no target, it grants access to
    // nothing, and accepting it would suggest it had been applied.
    return invalid('--authorization was given without --target', 'pass --target <url> as well');
  }
  return {
    kind: 'scan',
    ...(target === undefined ? {} : { target }),
    ...(authorizationPath === undefined ? {} : { authorizationPath }),
    mode,
    prelaunch: options.includes('--prelaunch'),
    offline: options.includes('--offline'),
    json,
  };
}

function usage(): string {
  return [
    'void-harness security <subcommand>',
    '',
    '  adapters                 list the declared scanners and whether each is installed',
    '  scan                     run the baseline over what is installed and judge the result',
    '',
    'Options',
    '  --target <url>           probe a running application; refused without an authorization',
    '  --authorization <file>   JSON grant naming hosts, authorizer, expiry and whether the',
    '                           target is ephemeral and writes are allowed',
    '  --mode <mode>            fast | team | fortress (default: team)',
    '  --prelaunch              hold the run to the stricter pre-launch bar, in any mode',
    '  --offline                refuse every scanner that would leave the machine',
    '  --json                   machine-readable output',
    '',
    'Every scanner is optional. A tool that is absent leaves its surface unmeasured,',
    'and an unmeasured surface is reported degraded or blocked — never green.',
    '',
  ].join('\n');
}

interface Detection {
  readonly available: readonly string[];
  /** Installed, but could not answer in time. Not the same thing as absent. */
  readonly unresponsive: readonly string[];
}

/**
 * Prove a tool is there by running what it declared, never by trusting a name.
 *
 * Absent and unresponsive are kept apart on purpose. A scanner that starts
 * slowly — a Python entry point on a cold cache, say — would otherwise be
 * reported as not installed, which reads as "nothing to do here" when the truth
 * is "something went wrong and this surface went unmeasured".
 */
async function detectAvailable(adapters: readonly SecurityAdapter[]): Promise<Detection> {
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        await execFile(adapter.command, [...adapter.versionArgs], {
          timeout: DETECT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        });
        return { id: adapter.id, state: 'available' as const };
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code: unknown }).code
            : undefined;
        if (code === 'ENOENT') return { id: adapter.id, state: 'absent' as const };
        const killed =
          typeof error === 'object' && error !== null && 'killed' in error && error.killed === true;
        if (killed) return { id: adapter.id, state: 'unresponsive' as const };
        // Exited non-zero on its own version flag: present, but not usable.
        return { id: adapter.id, state: 'unresponsive' as const };
      }
    }),
  );
  return {
    available: results.filter((entry) => entry.state === 'available').map((entry) => entry.id),
    unresponsive: results.filter((entry) => entry.state === 'unresponsive').map((entry) => entry.id),
  };
}

async function readAuthorization(path: string): Promise<ScopeAuthorization | null> {
  const body = await readFile(path, 'utf8');
  if (new TextEncoder().encode(body).byteLength > MAX_AUTHORIZATION_BYTES) {
    throw new Error(`${path}: file exceeds ${MAX_AUTHORIZATION_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Shape is not checked here on purpose: `authorizeTarget` refuses a malformed
  // grant with a reason of its own, and one authority on what a grant is beats
  // two that can disagree.
  return parsed as ScopeAuthorization;
}

/**
 * What a run amounted to, read against the codes the adapter declared.
 *
 * `errored` is the one that matters: a scanner that exits non-zero because it
 * could not run looks identical, at the process level, to one that exits
 * non-zero because it found something. Filing the first as the second reports
 * a crashed scan as a completed one.
 */
type RunOutcome = 'clean' | 'findings' | 'errored';

interface AdapterRun {
  readonly id: string;
  readonly command: string;
  readonly exitCode: number | 'timed-out' | 'failed-to-start';
  readonly outcome: RunOutcome;
}

export function outcomeOf(adapter: SecurityAdapter, exitCode: number): RunOutcome {
  if (adapter.exitCodes.clean.includes(exitCode)) return 'clean';
  if (adapter.exitCodes.findings.includes(exitCode)) return 'findings';
  return 'errored';
}

async function runAdapters(plan: Extract<ScanPlan, { kind: 'planned' }>): Promise<readonly AdapterRun[]> {
  const results: AdapterRun[] = [];
  for (const entry of plan.run) {
    const { adapter, argv } = entry;
    try {
      await execFile(adapter.command, [...argv], {
        timeout: adapter.limits.timeoutSeconds * 1_000,
        maxBuffer: adapter.limits.maxOutputBytes,
      });
      results.push({
        id: adapter.id,
        command: adapter.command,
        exitCode: 0,
        outcome: outcomeOf(adapter, 0),
      });
    } catch (error) {
      const killed = typeof error === 'object' && error !== null && 'killed' in error && error.killed === true;
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined;
      if (killed) {
        // Includes a maxBuffer overrun: output past the declared ceiling is a
        // scan whose result nobody has seen in full.
        results.push({ id: adapter.id, command: adapter.command, exitCode: 'timed-out', outcome: 'errored' });
        continue;
      }
      if (typeof code === 'number') {
        results.push({
          id: adapter.id,
          command: adapter.command,
          exitCode: code,
          outcome: outcomeOf(adapter, code),
        });
        continue;
      }
      results.push({
        id: adapter.id,
        command: adapter.command,
        exitCode: 'failed-to-start',
        outcome: 'errored',
      });
    }
  }
  return results;
}

export function completenessOf(
  runs: readonly AdapterRun[],
  plan: Extract<ScanPlan, { kind: 'planned' }>,
): ScanCompleteness {
  if (runs.some((run) => run.outcome === 'errored')) return 'errored';
  if (plan.missingTools.length > 0) return 'tool-missing';
  if (plan.run.length === 0) return 'partial';
  return 'complete';
}

function fail(problem: string, json: boolean, code = 'SECURITY_FAILED'): void {
  process.stderr.write(
    json
      ? `${JSON.stringify({ error: { code, problem } })}\n`
      : `${code}: ${problem}\n`,
  );
  process.exitCode = 1;
}

export async function security(args: readonly string[]): Promise<void> {
  const parsed = parseSecurityArgs(args);
  if (parsed.kind === 'help') {
    process.stdout.write(usage());
    return;
  }
  if (parsed.kind === 'invalid') {
    const json = args.includes('--json');
    process.stderr.write(
      json
        ? `${JSON.stringify({ error: { code: parsed.code, problem: parsed.problem, fix: parsed.fix } })}\n`
        : `${parsed.code}: ${parsed.problem}\nFix: ${parsed.fix}\n`,
    );
    process.exitCode = 2;
    return;
  }

  let manifest: Awaited<ReturnType<typeof loadSecurityManifest>>;
  try {
    manifest = await loadSecurityManifest(await findCoreSource());
  } catch (error) {
    // A manifest that exists and will not parse must never read as "no
    // scanners": that would report a clean baseline for a project that meant
    // to run several.
    fail(error instanceof Error ? error.message : String(error), parsed.json, 'SECURITY_MANIFEST_INVALID');
    return;
  }
  if (manifest === undefined) {
    fail('no security adapter manifest was found', parsed.json, 'SECURITY_MANIFEST_MISSING');
    return;
  }
  const detected = await detectAvailable(manifest.adapters);
  const available = detected.available;

  if (parsed.kind === 'adapters') {
    const rows = manifest.adapters.map((adapter) => ({
      id: adapter.id,
      kind: adapter.kind,
      command: adapter.command,
      reach: adapter.reach,
      mutates: adapter.mutates,
      installed: available.includes(adapter.id),
      unresponsive: detected.unresponsive.includes(adapter.id),
    }));
    process.stdout.write(
      parsed.json
        ? `${JSON.stringify({ adapters: rows })}\n`
        : `${rows
            .map((row) => `${row.installed ? 'installed  ' : row.unresponsive ? 'unresponsive' : 'absent     '} ${row.id.padEnd(16)} ${row.kind.padEnd(11)} reach:${row.reach}`)
            .join('\n')}\n`,
    );
    return;
  }

  const posture: SecurityPosture = { mode: parsed.mode, prelaunch: parsed.prelaunch };
  let authorization: ScopeAuthorization | null = null;
  if (parsed.authorizationPath !== undefined) {
    try {
      authorization = await readAuthorization(parsed.authorizationPath);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), parsed.json, 'SECURITY_AUTHORIZATION_INVALID');
      return;
    }
  }

  // Reports land in a run-scoped directory rather than the working tree: a
  // scanner's output can quote the very secret it found, and that is not
  // something to leave lying next to the source.
  const reportDir = await mkdtemp(join(tmpdir(), 'void-security-'));
  const plan = planSecurityScan({
    manifest,
    posture,
    available,
    ...(parsed.target === undefined ? {} : { target: parsed.target }),
    authorization,
    allowNetwork: !parsed.offline,
    reportDir,
    now: new Date().toISOString(),
  });

  if (plan.kind === 'refused') {
    process.stderr.write(
      parsed.json
        ? `${JSON.stringify({ verdict: 'refused', reason: plan.reason, detail: plan.detail })}\n`
        : `refused (${plan.reason}): ${plan.detail}\n`,
    );
    process.exitCode = 3;
    return;
  }

  const runs = await runAdapters(plan);
  const judged = judgeScan({
    completeness: completenessOf(runs, plan),
    posture,
    missingTools: plan.missingTools,
  });
  const report = {
    verdict: judged.verdict,
    detail: judged.detail,
    posture: describeSecurityPosture(posture),
    ran: runs,
    skipped: plan.skipped,
    unresponsive: detected.unresponsive,
    missingTools: plan.missingTools,
  };
  process.stdout.write(
    parsed.json
      ? `${JSON.stringify(report)}\n`
      : [
          `verdict: ${report.verdict} (${report.posture})`,
          report.detail,
          ...runs.map((run) => `  ran ${run.id}: ${run.outcome} (exit ${String(run.exitCode)})`),
          ...plan.skipped.map((entry) => `  skipped ${entry.id}: ${entry.reason} — ${entry.detail}`),
          '',
        ].join('\n'),
  );
  if (judged.verdict === 'blocked') process.exitCode = 1;
}
