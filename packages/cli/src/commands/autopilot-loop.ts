// `autopilot next | stop | fingerprint | seal | verdict | judgment`: the continuous
// loop's operator surface.
//
// Unlike the cluster subcommands, `next` observes GitHub and git itself. GitHub
// is the authority on a merge and the shared Git state is what a unit must not
// have touched, so neither is taken from an agent's report. Linear still arrives
// on stdin, from the orchestrator, because it is reachable only through MCP and
// never decides a merge. The command judges nothing: it admits what it is given
// and returns the kernel's actions.
//
// Local state is three things under `.void/machine/autopilot/`, all written only
// by an explicit command: the stop signal, one digest-only fingerprint per
// ticket, recorded before its unit begins, and one review seal per ticket,
// drawn at its assignment, which only the orchestrator and the reviewer read.

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
import { admitReviewVerdict, type ReviewVerdict, ticketIdSchema } from '../lib/autopilot/judgments.js';
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
  PULL_REQUEST_FIELDS,
  parsePullRequestView,
  pullRequestComments,
  REVIEW_STATUS_CONTEXT,
  readSharedState,
  resolveLoopBase,
} from '../lib/autopilot/loop-observe.js';
import { readProgramDescriptor } from '../lib/autopilot/program.js';
import {
  drawNonce,
  isNonce,
  publishedSeals,
  renderProof,
  renderSeal,
  sealDigest,
  verdictProof,
} from '../lib/autopilot/review-seal.js';
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
const SEAL_DIRECTORY = join(LOOP_DIRECTORY, 'seals');

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
function writeOnce(path: string, text: string, mode = 0o644): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, text, { encoding: 'utf8', mode });
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

/** The file one ticket's record lives in; a name that is not a ticket reaches no path. */
function ticketFile(root: string, directory: string, ticket: string, extension: string): string {
  const parsed = ticketIdSchema.safeParse(ticket);
  if (!parsed.success) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'the ticket named is not a tracker identifier',
      `${JSON.stringify(ticket.slice(0, 64))} does not name a ticket`,
      'pass the ticket identifier, for example `DEV-42`',
    );
  }
  return join(root, directory, `${parsed.data}${extension}`);
}

function fingerprintPath(root: string, ticket: string): string {
  return ticketFile(root, FINGERPRINT_DIRECTORY, ticket, '.json');
}

function sealPath(root: string, ticket: string): string {
  return ticketFile(root, SEAL_DIRECTORY, ticket, '.nonce');
}

/** The nonce drawn for a ticket, or undefined when none was; a damaged one is refused. */
function recordedNonce(root: string, ticket: string): string | undefined {
  const text = readIfPresent(sealPath(root, ticket));
  if (text === undefined) return undefined;
  const nonce = text.trim();
  if (isNonce(nonce)) return nonce;
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    `the review seal recorded for ${ticket} is unreadable`,
    'a seal is the sixty-four hex characters `autopilot seal` drew',
    'hand the ticket to a human; no verdict on it can be proved',
  );
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

function renderAction(action: LoopAction, humanWaitLabel: string): string {
  switch (action.kind) {
    case 'assign':
      return `assign ${action.ticketId} (${action.footprint.join(', ')})`;
    case 'wait':
    case 'hand-back-to-worker':
      return `${action.kind} ${action.ticketId}: ${action.reason}`;
    case 'mark-human-wait':
      return (
        `mark-human-wait ${action.ticketId} [${humanWaitLabel}]: ` +
        `${action.reason} - ${action.detail}`
      );
    case 'enable-auto-merge':
      return `enable-auto-merge ${action.ticketId}: #${action.pullRequest} at ${action.headSha}`;
    case 'rerun-review-check':
      return `rerun-review-check ${action.ticketId}: #${action.pullRequest}, run ${action.run}`;
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
  const lines = decision.actions.map((action) => renderAction(action, decision.humanWaitLabel));
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
  const seals = new Map<number, string>();
  for (const ticket of tracker.tickets) {
    const nonce = recordedNonce(context.root, ticket.id);
    if (ticket.pullRequest !== undefined && nonce !== undefined) seals.set(ticket.pullRequest, nonce);
  }
  const pullRequests = pullRequestsToObserve(program, tracker);
  const github = observeGithub(gh, { base, pullRequests, seals });
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
 * ticket whose unit is about to start; a second record is refused. It keeps the
 * settings of the bases and the branch that deploys whole and leaves out the
 * upstream of every other branch, which units in flight set and remove; the
 * record names the branches it kept, and `--after` reads them back. `--after`
 * compares, and fails when the shared state moved or was never recorded, so a
 * worker can refuse its own push.
 */
export function fingerprintCommand(
  argv: readonly string[],
  context: LoopRunners,
): LoopCommandOutput {
  const program = loopProgram(context.root);
  const reading = sharedReading(program, context);
  const before = flagValue(argv, '--before');
  const after = flagValue(argv, '--after');
  const kept = protectedBranches(program.autopilot);
  if (before !== undefined && after !== undefined) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot fingerprint takes --before or --after, not both',
      'one invocation either records a baseline or checks against it',
      'run it once with --before when the unit starts, once with --after when it ends',
    );
  }
  if (before !== undefined) {
    const path = fingerprintPath(context.root, before);
    const current = fingerprintOf(reading, kept);
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
    const current = fingerprintOf(reading, kept);
    return { value: current, human: `${JSON.stringify(current)}\n` };
  }
  const recorded = recordedFingerprint(context.root, after);
  const changed =
    recorded === undefined
      ? undefined
      : changedParts(recorded, fingerprintOf(reading, recorded.protectedBranches));
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
 * `autopilot seal --ticket <id> [--pr <n>]`.
 *
 * Without `--pr`, at assignment: draw the ticket's nonce and record it once,
 * readable by its owner alone, in the orchestration checkout, out of every
 * worktree. It is printed for the orchestrator to hand to the reviewer, and
 * to nobody else. With `--pr`, once the worker opened its pull request: post
 * the nonce's digest there, unless it already is. The nonce never leaves the
 * machine; only `autopilot verdict` uses it, to prove the verdict.
 */
export function sealCommand(argv: readonly string[], context: LoopRunners): LoopCommandOutput {
  const ticket = flagValue(argv, '--ticket');
  if (ticket === undefined) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot seal needs the ticket it seals',
      '--ticket was not given',
      'pass the ticket at its assignment, for example `--ticket DEV-42`',
    );
  }
  const path = sealPath(context.root, ticket);
  if (!argv.includes('--pr')) {
    const nonce = drawNonce();
    if (!writeOnce(path, `${nonce}\n`, 0o600)) {
      throw autopilotFailure(
        'AUTOPILOT_CONTRACT',
        `a seal is already drawn for ${ticket}`,
        'a second draw would orphan the digest already published and the reviewer holding it',
        `read the recorded seal from ${join(SEAL_DIRECTORY, `${ticket}.nonce`)} and hand it to the reviewer`,
      );
    }
    const digest = sealDigest(nonce);
    return {
      value: { ticketId: ticket, digest, nonce },
      human: `${nonce}\nthe seal of ${ticket}: hand it to its reviewer, never to its worker\n`,
    };
  }
  const number = pullRequestNumber(argv, 'autopilot seal --pr');
  const nonce = recordedNonce(context.root, ticket);
  if (nonce === undefined) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `no seal was drawn for ${ticket}`,
      'a digest published without its nonce proves no verdict',
      `draw it with \`autopilot seal --ticket ${ticket}\` before the review starts`,
    );
  }
  const digest = sealDigest(nonce);
  const gh = runner(context.gh, 'gh');
  const view = gh(['pr', 'view', String(number), '--json', PULL_REQUEST_FIELDS.join(',')]);
  const published = publishedSeals(pullRequestComments(view)).includes(digest);
  if (!published) {
    gh(['api', `repos/{owner}/{repo}/issues/${number}/comments`, '-f', `body=${renderSeal(digest)}`]);
  }
  return {
    value: { ticketId: ticket, pullRequest: number, digest, posted: !published },
    human: `#${number} ${published ? 'already carries' : 'now carries'} the seal of ${ticket}\n`,
  };
}

/**
 * `autopilot judgment conflict-class`: the comment block for the conflict class
 * on stdin, admitted before it is printed. The worker posts exactly this, so the
 * kernel finds it on the pull request after a restart and admits it a second
 * time there. A review verdict is not rendered here: `autopilot verdict` is the
 * only path that writes one.
 */
export function judgmentCommand(argv: readonly string[], stdin: string): LoopCommandOutput {
  const value = jsonFrom(stdin, 'judgment');
  const kind = argv.slice(argv.indexOf('judgment') + 1).find((arg) => !arg.startsWith('-'));
  if (kind === 'review-verdict') {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'a review verdict is not rendered for posting by hand',
      'the comment and the `void/independent-review` status must be written together',
      'pipe the verdict into `void-harness autopilot verdict --pr <number>`',
    );
  }
  const kinds = JUDGMENT_KINDS.filter((known) => known !== 'review-verdict');
  if (kind === undefined || !(kinds as readonly string[]).includes(kind)) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot judgment needs the kind of judgment it renders',
      `${JSON.stringify(kind ?? '')} is not one of ${kinds.join(', ')}`,
      'run `autopilot judgment conflict-class`',
    );
  }
  const body = renderJudgmentComment(kind as JudgmentKind, value);
  return { value: { kind, body }, human: body };
}

function jsonFrom(stdin: string, command: string): unknown {
  try {
    return JSON.parse(stdin);
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      `the ${command} on stdin is not valid JSON`,
      error instanceof Error ? error.message : String(error),
      `pipe the typed ${command}, unmodified, into \`autopilot ${command}\``,
    );
  }
}

function pullRequestNumber(argv: readonly string[], command = 'autopilot verdict'): number {
  const text = flagValue(argv, '--pr');
  const number = Number(text);
  if (text !== undefined && /^[1-9][0-9]{0,9}$/.test(text)) return number;
  throw autopilotFailure(
    'AUTOPILOT_USAGE',
    `${command} needs the pull request it names`,
    text === undefined ? '--pr was not given' : `--pr ${JSON.stringify(text)} is not a number`,
    'pass the pull request number, for example `--pr 42`',
  );
}

/** A status description is at most 140 characters on GitHub. */
function statusDescription(verdict: ReviewVerdict): string {
  const count = verdict.blocking.length;
  if (count === 0) return `round ${verdict.round}: nothing blocking`;
  return `round ${verdict.round}: ${count} blocking finding${count === 1 ? '' : 's'}`;
}

/** The nonce the reviewer was handed; its absence or its shape is refused before GitHub is asked. */
function reviewNonce(argv: readonly string[]): string {
  const nonce = flagValue(argv, '--nonce');
  if (nonce !== undefined && isNonce(nonce)) return nonce;
  throw autopilotFailure(
    nonce === undefined ? 'AUTOPILOT_USAGE' : 'AUTOPILOT_INPUT',
    'autopilot verdict needs the seal the orchestrator handed to the reviewer',
    nonce === undefined ? '--nonce was not given' : 'the --nonce given is not sixty-four hex characters',
    'pass the nonce of the ticket as `--nonce <hex>`; a verdict without it is not believed',
  );
}

/**
 * `autopilot verdict --pr <n> --nonce <hex>`: the only path that writes a review verdict.
 *
 * The verdict on stdin is admitted, then bound to the head the pull request has
 * now: a verdict on any other head judged code that is no longer there. The
 * nonce must answer the seal published on the pull request, and the comment
 * carries a proof keyed by it, which the loop checks before it believes the
 * verdict: a status and a comment alone are what anyone could post. The
 * comment goes first and the status second, so a failure between the two leaves
 * a comment no status confirms, which the loop does not believe, rather than a
 * status with no verdict behind it. The job that enforces the status is re-run
 * when its completed run disagrees, because a status event starts no workflow.
 */
export function verdictCommand(
  argv: readonly string[],
  stdin: string,
  context: LoopRunners,
): LoopCommandOutput {
  const value = jsonFrom(stdin, 'verdict');
  const number = pullRequestNumber(argv);
  const nonce = reviewNonce(argv);
  const admission = admitReviewVerdict(value);
  if (!admission.ok) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the review verdict was refused',
      admission.reason,
      'correct the named field; a refused verdict is never posted',
    );
  }
  const verdict = admission.value;
  const gh = runner(context.gh, 'gh');
  const viewArgs = ['pr', 'view', String(number), '--json', PULL_REQUEST_FIELDS.join(',')];
  const viewText = gh(viewArgs);
  const pr = parsePullRequestView(viewText);
  if (pr.state !== 'open' || pr.headSha !== verdict.headSha) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `the verdict does not judge #${number} as it stands`,
      pr.state !== 'open'
        ? `#${number} is ${pr.state}`
        : `the verdict reads head ${verdict.headSha}; #${number} is now at ${pr.headSha}`,
      'review the current head and post a verdict bound to it',
    );
  }
  if (!publishedSeals(pullRequestComments(viewText)).includes(sealDigest(nonce))) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `the nonce answers no seal published on #${number}`,
      'the loop believes a verdict only when its proof answers the digest it published',
      'check the nonce the orchestrator handed over, or have it publish the seal with `autopilot seal --pr`',
    );
  }
  const clean = verdict.blocking.length === 0;
  const state = clean ? 'success' : 'failure';
  const proof = verdictProof(nonce, { pullRequest: number, headSha: verdict.headSha, state });
  const body = `${renderJudgmentComment('review-verdict', verdict)}${renderProof(proof)}\n`;
  gh(['api', `repos/{owner}/{repo}/issues/${number}/comments`, '-f', `body=${body}`]);
  gh([
    'api', `repos/{owner}/{repo}/statuses/${verdict.headSha}`,
    '-f', `state=${state}`,
    '-f', `context=${REVIEW_STATUS_CONTEXT}`,
    '-f', `description=${statusDescription(verdict)}`,
  ]);
  const run = pr.reviewCheckRun;
  const disagrees = clean ? pr.reviewCheck === 'failing' : pr.reviewCheck === 'passing';
  if (run !== undefined && disagrees) {
    gh(['run', 'rerun', String(run), ...(clean ? ['--failed'] : [])]);
  }
  const rerun = run !== undefined && disagrees ? { rerun: run } : {};
  return {
    value: { pullRequest: number, headSha: verdict.headSha, state, ...rerun },
    human: `#${number} at ${verdict.headSha}: ${state}${run !== undefined && disagrees ? `, run ${run} re-run` : ''}\n`,
  };
}
