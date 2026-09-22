// `autopilot next | stop | fingerprint`: the continuous loop's operator surface.
//
// Unlike the cluster subcommands, `next` observes GitHub and git itself. GitHub
// is the authority on a merge and the shared Git state is what a unit must not
// have touched, so neither is taken from an agent's report. Linear still arrives
// on stdin, from the orchestrator, because it is reachable only through MCP and
// never decides a merge. The command judges nothing: it admits what it is given
// and returns the kernel's actions.
//
// Local state is two things under `.void/machine/autopilot/`, both written only
// by an explicit command: the stop signal, and one digest-only fingerprint per
// ticket, recorded before its unit begins.

import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { autopilotFailure } from '../lib/autopilot/errors.js';
import {
  JUDGMENT_KINDS,
  type JudgmentKind,
  renderJudgmentComment,
} from '../lib/autopilot/judgment-comment.js';
import { ticketIdSchema } from '../lib/autopilot/judgments.js';
import {
  admitLoopTracker,
  decideLoop,
  type LoopAction,
  type LoopDecision,
  type LoopProgram,
  type LoopTracker,
  loopProgramOf,
  parseStopSignal,
  protectedBranches,
  type PullRequestObservation,
  pullRequestsToObserve,
  type StopSignal,
} from '../lib/autopilot/loop.js';
import {
  type GhRunner,
  type GitRunner,
  observeGithub,
  readSharedState,
  resolveLoopBase,
} from '../lib/autopilot/loop-observe.js';
import { readProgramDescriptor } from '../lib/autopilot/program.js';
import {
  admitFingerprint,
  changedParts,
  fingerprintOf,
  type SharedFingerprint,
  type SharedStateReading,
} from '../lib/autopilot/shared-state.js';
import { flagValue } from './autopilot-usage.js';

/** What a loop command prints: the JSON value, and the line a human reads. */
export interface LoopCommandOutput {
  readonly value: unknown;
  readonly human: string;
}

/** The two runners the loop observes through; injected so tests run on captures. */
export interface LoopRunners {
  readonly root: string;
  readonly gh?: GhRunner;
  readonly git?: GitRunner;
}

const LOOP_DIRECTORY = join('.void', 'machine', 'autopilot');
export const STOP_SIGNAL_PATH = join(LOOP_DIRECTORY, 'stop');
const FINGERPRINT_DIRECTORY = join(LOOP_DIRECTORY, 'fingerprints');

function runner<T>(value: T | undefined, name: string): T {
  if (value !== undefined) return value;
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    `the loop has no ${name} runner`,
    'the command was invoked without an execution context that can observe',
    'invoke autopilot through the CLI entry point rather than calling it directly',
  );
}

function readIfPresent(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Write through a temporary file, so a reader never sees half a record. */
function writeAtomically(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text, 'utf8');
  renameSync(temporary, path);
}

/**
 * Write a record that must never be replaced: the complete file is linked into
 * place, and a link onto an existing path fails, so a second writer loses
 * without ever exposing half a record. Returns false when one already exists.
 */
function writeOnce(path: string, text: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, text, 'utf8');
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false;
    throw error;
  } finally {
    unlinkSync(temporary);
  }
}

function fingerprintPath(root: string, ticket: string): string {
  const parsed = ticketIdSchema.safeParse(ticket);
  if (!parsed.success) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'the ticket to fingerprint is not a tracker identifier',
      `${JSON.stringify(ticket.slice(0, 64))} does not name a ticket`,
      'pass the ticket identifier, for example `--before DEV-42`',
    );
  }
  return join(root, FINGERPRINT_DIRECTORY, `${parsed.data}.json`);
}

function recordedFingerprint(root: string, ticket: string): SharedFingerprint | undefined {
  const text = readIfPresent(fingerprintPath(root, ticket));
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const admission = admitFingerprint(value);
  if (admission.ok) return admission.value;
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    `the fingerprint recorded for ${ticket} is unreadable`,
    admission.reason,
    'hand the unit to a human; a baseline recorded after the unit began proves nothing',
  );
}

function trackerFrom(stdin: string): LoopTracker {
  let value: unknown;
  try {
    value = JSON.parse(stdin);
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the loop tracker observation on stdin is not valid JSON',
      error instanceof Error ? error.message : String(error),
      'pipe the Linear state the orchestrator observed, unmodified, into `autopilot next`',
    );
  }
  const admission = admitLoopTracker(value);
  if (admission.ok) return admission.value;
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    'the loop tracker observation was refused',
    admission.reason,
    'correct the named field; a refused observation is never read charitably',
  );
}

function loopProgram(root: string): LoopProgram {
  const descriptor = readProgramDescriptor(root);
  if (descriptor === undefined) {
    throw autopilotFailure(
      'AUTOPILOT_PROGRAM',
      'the loop runs under a programme and this project declares none',
      '`.void/program.md` is absent',
      'declare the programme, with its `autopilot` block and `progress` provider',
    );
  }
  return loopProgramOf(descriptor);
}

function renderAction(action: LoopAction): string {
  switch (action.kind) {
    case 'assign':
      return `assign ${action.ticketId} (${action.footprint.join(', ')})`;
    case 'wait':
    case 'hand-back-to-worker':
      return `${action.kind} ${action.ticketId}: ${action.reason}`;
    case 'mark-human-wait':
      return `mark-human-wait ${action.ticketId}: ${action.reason} - ${action.detail}`;
    case 'enable-auto-merge':
      return `enable-auto-merge ${action.ticketId}: #${action.pullRequest} at ${action.headSha}`;
    case 'requeue':
      return (
        `requeue ${action.ticketId}: #${action.pullRequest} at ${action.headSha},` +
        ` ejected ${action.ejections}x`
      );
    case 'drain':
      return `drain: ${action.reason}`;
    case 'freeze':
      return 'freeze';
    case 'recap':
      return `recap: merged ${action.merged.join(', ') || 'none'}; waiting ${
        action.humanWait.join(', ') || 'none'
      }`;
    default:
      return action satisfies never;
  }
}

function renderDecision(decision: LoopDecision): string {
  const lines = decision.actions.map(renderAction);
  for (const refusal of decision.refusals) lines.push(`refused: ${refusal}`);
  return `${lines.length === 0 ? 'nothing to do' : lines.join('\n')}\n`;
}

/**
 * `autopilot next`: programme, Linear on stdin, GitHub, git and the stop signal
 * in; the kernel's actions out. An immediate stop reads neither GitHub nor the
 * recorded fingerprints: freezing must not depend on the network answering.
 */
export function nextCommand(stdin: string, context: LoopRunners): LoopCommandOutput {
  const tracker = trackerFrom(stdin);
  const program = loopProgram(context.root);
  const signal: StopSignal = parseStopSignal(readIfPresent(join(context.root, STOP_SIGNAL_PATH)));
  const current = sharedReading(program, context);
  if (signal === 'now') {
    const pullRequests = new Map<number, PullRequestObservation>();
    const github = { base: program.autopilot.base, mergeQueue: false, pullRequests };
    const sharedState = { current, before: new Map<string, SharedFingerprint>() };
    const decision = decideLoop({ program, tracker, github, signal, sharedState });
    return { value: decision, human: renderDecision(decision) };
  }
  const gh = runner(context.gh, 'gh');
  const base = resolveLoopBase(gh, program.autopilot.base);
  const github = observeGithub(gh, { base, pullRequests: pullRequestsToObserve(program, tracker) });
  const before = new Map<string, SharedFingerprint>();
  for (const ticket of tracker.tickets) {
    const recorded = recordedFingerprint(context.root, ticket.id);
    if (recorded !== undefined) before.set(ticket.id, recorded);
  }
  const sharedState = { current, before };
  const decision = decideLoop({ program, tracker, github, signal, sharedState });
  return { value: decision, human: renderDecision(decision) };
}

function sharedReading(program: LoopProgram, context: LoopRunners): SharedStateReading {
  const bases = protectedBranches(program.autopilot);
  return readSharedState(runner(context.git, 'git'), { bases });
}

/** `autopilot stop --drain | --now`: write the signal the loop reads each tick. */
export function stopCommand(argv: readonly string[], context: LoopRunners): LoopCommandOutput {
  const drain = argv.includes('--drain');
  const now = argv.includes('--now');
  if (drain === now) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot stop needs exactly one of --drain or --now',
      drain ? 'both were given' : 'neither was given',
      'pass --drain to finish the tickets in flight, or --now to freeze everything',
    );
  }
  const signal = drain ? 'drain' : 'now';
  writeAtomically(join(context.root, STOP_SIGNAL_PATH), `${signal}\n`);
  return {
    value: { signal, path: STOP_SIGNAL_PATH },
    human: `stop signal written: ${signal} (${STOP_SIGNAL_PATH})\n`,
  };
}

/**
 * `autopilot fingerprint [--before <ticket> | --after <ticket>]`.
 *
 * Bare, it prints the current digests. `--before` records them, once, for a
 * ticket whose unit is about to start; a second record is refused. It needs the
 * branch the unit will push (`--branch`), the one whose upstream it leaves out;
 * `--after` reads that branch back from the record. `--after` compares, and fails when the shared
 * state moved or was never recorded, so a worker can refuse its own push.
 */
export function fingerprintCommand(
  argv: readonly string[],
  context: LoopRunners,
): LoopCommandOutput {
  const reading = sharedReading(loopProgram(context.root), context);
  const before = flagValue(argv, '--before');
  const after = flagValue(argv, '--after');
  const branch = flagValue(argv, '--branch');
  if (before !== undefined && after !== undefined) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot fingerprint takes --before or --after, not both',
      'one invocation either records a baseline or checks against it',
      'run it once with --before when the unit starts, once with --after when it ends',
    );
  }
  if (before !== undefined) {
    if (branch === undefined) {
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        'autopilot fingerprint --before needs the branch the unit will push',
        'without --branch every upstream setting counts, so the worker\'s own push'
          + ' would refuse its unit',
        'pass the ticket branch, for example `--before DEV-42 --branch work/dev-42`',
      );
    }
    const path = fingerprintPath(context.root, before);
    const current = fingerprintOf(reading, branch);
    if (!writeOnce(path, `${JSON.stringify(current)}\n`)) {
      throw autopilotFailure(
        'AUTOPILOT_CONTRACT',
        `a baseline is already recorded for ${before}`,
        'a second --before would replace the state the unit started from with the state it left',
        'keep the recorded baseline; only a person who has checked the unit deletes it',
      );
    }
    return { value: { ticketId: before, recorded: current }, human: `recorded for ${before}\n` };
  }
  if (after === undefined) {
    const current = fingerprintOf(reading, branch ?? '');
    return { value: current, human: `${JSON.stringify(current)}\n` };
  }
  const recorded = recordedFingerprint(context.root, after);
  const changed =
    recorded === undefined
      ? undefined
      : changedParts(recorded, fingerprintOf(reading, recorded.branch));
  if (changed === undefined || changed.length > 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `the unit of ${after} may not be published`,
      changed === undefined
        ? 'no fingerprint was recorded before the unit began'
        : `the shared Git state changed: ${changed.join(', ')}`,
      'leave the unit unpublished and hand it to a human with this report',
    );
  }
  return {
    value: { ticketId: after, unchanged: true },
    human: `${after}: shared state unchanged\n`,
  };
}

/**
 * `autopilot judgment <review-verdict | conflict-class>`: the comment block for
 * the judgment on stdin, admitted before it is printed. The reviewer and the
 * workers post exactly this, so the kernel finds it on the pull request after a
 * restart and admits it a second time there.
 */
export function judgmentCommand(argv: readonly string[], stdin: string): LoopCommandOutput {
  let value: unknown;
  try {
    value = JSON.parse(stdin);
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the judgment on stdin is not valid JSON',
      error instanceof Error ? error.message : String(error),
      'pipe the typed judgment, unmodified, into `autopilot judgment`',
    );
  }
  const kind = argv.slice(argv.indexOf('judgment') + 1).find((arg) => !arg.startsWith('-'));
  if (kind === undefined || !(JUDGMENT_KINDS as readonly string[]).includes(kind)) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot judgment needs the kind of judgment it renders',
      `${JSON.stringify(kind ?? '')} is not one of ${JUDGMENT_KINDS.join(', ')}`,
      'run `autopilot judgment review-verdict` or `autopilot judgment conflict-class`',
    );
  }
  const body = renderJudgmentComment(kind as JudgmentKind, value);
  return { value: { kind, body }, human: body };
}
