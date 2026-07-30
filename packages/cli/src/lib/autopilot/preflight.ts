// What autopilot needs before it claims anything, judged from an observation.
//
// The failure this prevents is specific and expensive: a capability discovered
// missing halfway through leaves a cluster leased in the tracker, worktrees on
// disk and no one working them. Every check below therefore runs BEFORE the
// lease, and every one of them is non-mutating — doctor must be safe to run on
// a project mid-flight, which means it may not touch Linear, GitHub or git refs.
//
// Pure. The caller observes; this judges. That split is what lets the whole
// preflight be tested without a tracker, a network or a repository, and it is
// the same shape the rest of this bounded context uses.
//
// `unknown` is a first-class answer. "I could not read the branch protection"
// is not "the branch is unprotected", and collapsing the two either blocks a
// healthy project or green-lights an unprotected base.

import type { CheckResult } from '../prerequisites.js';

export interface AutopilotObservation {
  /** Parsed `plans/ACTIVE.md` frontmatter, or null when the file is absent. */
  readonly activeProgram: {
    readonly status?: string;
    readonly autopilot?: {
      readonly enabled?: boolean;
      readonly clusterSize?: number;
      readonly mergeGate?: string;
      readonly verifyCommands?: readonly (readonly string[])[];
    };
  } | null;
  /** Runtime adapters detected in the project, e.g. `['claude']`. */
  readonly adapters: readonly string[];
  /** Tracker connector reachability, or null when it could not be determined. */
  readonly trackerConnector: boolean | null;
  /** Whether git worktrees can be created here, or null when unknown. */
  readonly worktreesUsable: boolean | null;
  /** Base-branch protection, or null when it could not be read. */
  readonly baseProtected: boolean | null;
}

const RUNTIME_ADAPTERS = ['claude', 'codex'];

function pass(name: string, message: string): CheckResult {
  return { name, ok: true, status: 'pass', message };
}

function fail(name: string, message: string, fix: string): CheckResult {
  return { name, ok: false, status: 'fail', message, fix };
}

/** Not a failure and not a pass: something the run could not read. */
function unknown(name: string, message: string, fix: string): CheckResult {
  return { name, ok: false, status: 'unknown', message, fix };
}

function activeProgramCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot ACTIVE';
  const program = observation.activeProgram;
  if (program === null) {
    return unknown(
      name,
      'no plans/ACTIVE.md, so there is no program to drain',
      'author one with harness:ticket-writer, or ignore autopilot in this project',
    );
  }
  if (program.status !== 'executing') {
    return fail(
      name,
      `status is ${JSON.stringify(program.status ?? 'absent')}, not "executing"`,
      'set status: executing once the plan and its ticket pool are approved',
    );
  }
  if (program.autopilot?.enabled !== true) {
    return fail(
      name,
      'autopilot.enabled is not true, so nothing resumes automatically',
      'set autopilot.enabled: true in the ACTIVE frontmatter',
    );
  }
  return pass(name, 'executing, autopilot enabled');
}

function mergeGateCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot merge';
  const gate = observation.activeProgram?.autopilot?.mergeGate;
  // The only accepted value. A project cannot opt into automation here: the
  // human merge is the contract the whole design rests on.
  if (gate !== undefined && gate !== 'human') {
    return fail(
      name,
      `mergeGate is ${JSON.stringify(gate)}; the only accepted value is "human"`,
      'set mergeGate: human — autopilot never merges, and no flag changes that',
    );
  }
  return pass(name, 'human merge gate');
}

function verifyCommandsCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot verify';
  const commands = observation.activeProgram?.autopilot?.verifyCommands ?? [];
  if (commands.length === 0) {
    return fail(
      name,
      'no verifyCommands, so nothing would prove the integration branch',
      'declare the suite that mirrors CI, for example `- [pnpm, test]`',
    );
  }
  const malformed = commands.find(
    (command) => !Array.isArray(command) || command.length === 0 || command.some((word) => typeof word !== 'string' || word === ''),
  );
  if (malformed !== undefined) {
    return fail(
      name,
      `${JSON.stringify(malformed)} is not a usable argv array`,
      'write each command as an argv array; it runs with shell:false, never through a shell',
    );
  }
  return pass(name, `${commands.length} verify command(s)`);
}

function adapterCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot runtime';
  const usable = observation.adapters.filter((adapter) => RUNTIME_ADAPTERS.includes(adapter));
  if (usable.length === 0) {
    return fail(
      name,
      'no runtime adapter detected, so no worker could be spawned',
      'wire a runtime with `void-harness runtime add claude` or `codex`',
    );
  }
  return pass(name, `${usable.join(', ')} adapter(s)`);
}

function connectorCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot tracker';
  if (observation.trackerConnector === null) {
    return unknown(
      name,
      'the tracker connector could not be probed',
      'run the check again with the connector configured; autopilot will not claim on an unknown tracker',
    );
  }
  return observation.trackerConnector
    ? pass(name, 'connector reachable')
    : fail(
        name,
        'no reachable tracker connector, so no ticket could be claimed or closed',
        'configure the tracker connector for this runtime before enabling autopilot',
      );
}

function worktreeCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot worktrees';
  if (observation.worktreesUsable === null) {
    return unknown(name, 'worktree support could not be determined', 'run this inside the git repository autopilot would work in');
  }
  return observation.worktreesUsable
    ? pass(name, 'worktrees usable')
    : fail(
        name,
        'worktrees cannot be created here, and a worker never works in the main checkout',
        'run autopilot from a git repository where `git worktree add` succeeds',
      );
}

function protectionCheck(observation: AutopilotObservation): CheckResult {
  const name = 'autopilot base';
  if (observation.baseProtected === null) {
    return unknown(
      name,
      'branch protection could not be read',
      'grant the token repository read access, or verify protection by hand before running',
    );
  }
  return observation.baseProtected
    ? pass(name, 'base branch protected')
    : fail(
        name,
        'the base branch is unprotected, so nothing server-side stops a bad merge',
        'require status checks on the base branch; autopilot relies on it as its last line',
      );
}

/**
 * Every autopilot precondition, in the order a run would hit them.
 *
 * Returns results rather than throwing, and mutates nothing: doctor reports, it
 * does not repair, and it must stay safe to run while a cluster is in flight.
 */
export function autopilotPreflight(observation: AutopilotObservation): readonly CheckResult[] {
  return Object.freeze([
    activeProgramCheck(observation),
    mergeGateCheck(observation),
    verifyCommandsCheck(observation),
    adapterCheck(observation),
    connectorCheck(observation),
    worktreeCheck(observation),
    protectionCheck(observation),
  ]);
}
