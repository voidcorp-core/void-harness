// `autopilot next | stop | fingerprint | review-key | arm | disarm | verdict | judgment`: the
// continuous loop's operator surface.
//
// Unlike the cluster subcommands, `next` observes GitHub and git itself. GitHub
// is the authority on a merge and the shared Git state is what a unit must not
// have touched, so neither is taken from an agent's report. Linear still arrives
// on stdin, from the orchestrator, because it is reachable only through MCP and
// never decides a merge. The command judges nothing: it admits what it is given
// and returns the kernel's actions.
//
// Local state is four things under `.void/machine/autopilot/`, all written only
// by an explicit command: the stop signal, one digest-only fingerprint per
// ticket, recorded before its unit begins, the private review key, drawn once
// and read only by `verdict`, and the head each ticket's auto-merge was armed
// on, which GitHub does not keep. The public review key is versioned beside
// the workflows, where only a merge changes it.

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
import { z } from 'zod';
import { autopilotFailure } from '../lib/autopilot/errors.js';
import {
  JUDGMENT_KINDS,
  type JudgmentKind,
  renderJudgmentComment,
} from '../lib/autopilot/judgment-comment.js';
import { admitReviewVerdict, type ReviewVerdict, ticketIdSchema } from '../lib/autopilot/judgments.js';
import {
  admitLoopTracker,
  type ArmedRecord,
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
  type VerdictVerifier,
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
  generateReviewKey,
  keyFingerprint,
  publicKeyOf,
  REVIEW_PUBLIC_KEY_PATH,
  renderSignature,
  signVerdict,
  verdictDigest,
} from '../lib/autopilot/review-signature.js';
import {
  admitFingerprint,
  changedParts,
  fingerprintOf,
  type SharedFingerprint,
  type SharedStateReading,
} from '../lib/autopilot/shared-state.js';
import { flagValue } from './autopilot-usage.js';

const LOOP_SUBCOMMANDS = [
  'next',
  'stop',
  'fingerprint',
  'review-key',
  'arm',
  'disarm',
  'verdict',
] as const;
export type LoopSubcommand = (typeof LOOP_SUBCOMMANDS)[number];

export function isLoopSubcommand(subcommand: string): subcommand is LoopSubcommand {
  return (LOOP_SUBCOMMANDS as readonly string[]).includes(subcommand);
}

/**
 * The continuous loop's subcommands that observe or write local state, routed
 * here so the cluster engine's dispatcher names none of them.
 */
export function loopCommand(
  subcommand: LoopSubcommand,
  argv: readonly string[],
  stdin: string,
  context: LoopRunners,
): LoopCommandOutput {
  switch (subcommand) {
    case 'next':
      return nextCommand(stdin, context);
    case 'stop':
      return stopCommand(argv, context);
    case 'fingerprint':
      return fingerprintCommand(argv, context);
    case 'review-key':
      return reviewKeyCommand(context);
    case 'arm':
      return armCommand(argv, context);
    case 'disarm':
      return disarmCommand(argv, context);
    case 'verdict':
      return verdictCommand(argv, stdin, context);
    default:
      return subcommand satisfies never;
  }
}

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
  /** The clock a verdict is signed at; the wall clock unless a test fixes it. */
  readonly now?: string;
}

const LOOP_DIRECTORY = join('.void', 'machine', 'autopilot');
export const STOP_SIGNAL_PATH = join(LOOP_DIRECTORY, 'stop');
const FINGERPRINT_DIRECTORY = join(LOOP_DIRECTORY, 'fingerprints');
const REVIEW_KEY_PATH = join(LOOP_DIRECTORY, 'review-key.pem');
const ARMED_DIRECTORY = join(LOOP_DIRECTORY, 'armed');
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const armedRecordSchema = z.strictObject({
  pullRequest: z.int().positive(),
  headSha: z.string().regex(SHA_PATTERN),
});

function runner<T>(value: T | undefined, name: string): T {
  if (value !== undefined) return value;
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    `the loop has no ${name} runner`,
    'the command was invoked without an execution context that can observe',
    'invoke autopilot through the CLI entry point rather than calling it directly',
  );
}

/**
 * Refuse to run anywhere but the orchestration checkout, where the review
 * secret lives. A linked worktree, which is what a worker runs in, has a Git
 * directory of its own under the repository's common one; the main checkout's
 * are the same directory. Git resolves both, so the comparison follows what
 * `git worktree` does rather than a path layout, and `--path-format=absolute`
 * keeps git from answering `.git` relative to where it runs. It stops a
 * mistake or an injected command in a worker, not a separate clone, which
 * holds no secret to use.
 */
function requireOrchestrationCheckout(context: LoopRunners, command: string): void {
  const git = runner(context.git, 'git');
  let answer: string;
  try {
    answer = git(['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']);
  } catch (error) {
    answer = error instanceof Error ? error.message : String(error);
  }
  const [gitDir, commonDir, ...rest] = answer.trim().split('\n');
  if (gitDir !== undefined && gitDir === commonDir && rest.length === 0) return;
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    `${command} runs only in the orchestration checkout`,
    commonDir === undefined
      ? `git could not name this checkout: ${answer.trim().slice(0, 200)}`
      : `this is a linked worktree (${gitDir}) of ${commonDir}, where a worker runs`,
    'run it from the main checkout of the repository, the one the loop runs in',
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

function armedPath(root: string, ticket: string): string {
  return ticketFile(root, ARMED_DIRECTORY, ticket, '.json');
}

/** The head a ticket's auto-merge was armed on, or undefined; a damaged record is refused. */
function recordedArm(root: string, ticket: string): ArmedRecord | undefined {
  const text = readIfPresent(armedPath(root, ticket));
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const parsed = armedRecordSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    `the armed head recorded for ${ticket} is unreadable`,
    'a record is the pull request and the head `autopilot arm` armed it on',
    'disarm the pull request by hand and let the loop arm it again',
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
    case 'disable-auto-merge':
      return (
        `disable-auto-merge ${action.ticketId}: #${action.pullRequest} at ${action.headSha},` +
        ` armed on ${action.armedSha ?? 'an unrecorded head'}`
      );
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
        action.humanWait.map((entry) => `${entry.ticketId} (${entry.reason})`).join(', ') || 'none'
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
 * in; the kernel's actions out.
 */
export function nextCommand(stdin: string, context: LoopRunners): LoopCommandOutput {
  const tracker = trackerFrom(stdin);
  const program = loopProgram(context.root);
  const signal: StopSignal = parseStopSignal(readIfPresent(join(context.root, STOP_SIGNAL_PATH)));
  const current = sharedReading(program, context);
  if (signal === 'now') return freezeCommand(program, tracker, current, context);
  const gh = runner(context.gh, 'gh');
  const base = resolveLoopBase(gh, program.autopilot.base);
  const reviewKey = trustedReviewKey(gh, context.root, base);
  const verifiers = new Map<number, VerdictVerifier>();
  for (const ticket of tracker.tickets) {
    if (ticket.pullRequest === undefined || reviewKey.publicKey === undefined) continue;
    const { publicKey, repository } = reviewKey;
    verifiers.set(ticket.pullRequest, { publicKey, repository, ticketId: ticket.id });
  }
  const pullRequests = pullRequestsToObserve(program, tracker);
  const github = observeGithub(gh, { base, pullRequests, verifiers });
  const before = new Map<string, SharedFingerprint>();
  for (const ticket of tracker.tickets) {
    const recorded = recordedFingerprint(context.root, ticket.id);
    if (recorded !== undefined) before.set(ticket.id, recorded);
  }
  const armed = new Map<string, ArmedRecord>();
  for (const ticket of tracker.tickets) {
    const record = recordedArm(context.root, ticket.id);
    if (record !== undefined) armed.set(ticket.id, record);
  }
  const sharedState = { current, before };
  const decision = decideLoop({ program, tracker, github, signal, sharedState, armed });
  const warning = reviewKey.problem === undefined ? '' : `review key: ${reviewKey.problem}\n`;
  return {
    value: { ...decision, reviewKey: reviewKey.problem ?? 'trusted' },
    human: `${warning}${renderDecision(decision)}`,
  };
}

/** `owner/name`, as gh resolves the current repository. */
function repositoryName(gh: GhRunner): string {
  return gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
}

/**
 * The public review key the loop verifies verdicts with, and the repository it
 * signs for. It is trusted only when the key versioned on the base, which the
 * required check reads, is the public half of the private key this checkout
 * holds: a key someone else published answers a private key the loop never
 * drew, so nothing signed with it is believed, and every armed merge on an
 * unbelieved verdict is disarmed.
 */
function trustedReviewKey(
  gh: GhRunner,
  root: string,
  base: string,
): { readonly publicKey?: string; readonly repository: string; readonly problem?: string } {
  const repository = repositoryName(gh);
  const privateKey = readIfPresent(join(root, REVIEW_KEY_PATH));
  if (privateKey === undefined) {
    return { repository, problem: 'no private key here; run `autopilot review-key`' };
  }
  const local = publicKeyOf(privateKey);
  let published: string | undefined;
  try {
    const endpoint = `repos/{owner}/{repo}/contents/${REVIEW_PUBLIC_KEY_PATH}?ref=${base}`;
    const content = gh(['api', endpoint, '--jq', '.content']).replace(/\s/g, '');
    published = Buffer.from(content, 'base64').toString('utf8');
  } catch {
    published = undefined;
  }
  if (published === undefined || published.trim() === '') {
    return { repository, problem: `${base} carries no ${REVIEW_PUBLIC_KEY_PATH}` };
  }
  let matches = false;
  try {
    matches = keyFingerprint(published) === keyFingerprint(local);
  } catch {
    matches = false;
  }
  if (!matches) {
    return {
      repository,
      problem: `${REVIEW_PUBLIC_KEY_PATH} on ${base} is not this checkout's key;`
        + ' no verdict is believed',
    };
  }
  return { publicKey: local, repository };
}

/**
 * An immediate stop reads only what GitHub would still merge on its own: each
 * pull request in flight, for its auto-merge, and nothing else. No pull
 * request, no call. One it cannot read refuses the freeze and names the
 * pull requests to disarm by hand, rather than report a stop that GitHub
 * could still overrun.
 */
function freezeCommand(
  program: LoopProgram,
  tracker: LoopTracker,
  current: SharedStateReading,
  context: LoopRunners,
): LoopCommandOutput {
  const numbers = pullRequestsToObserve(program, tracker);
  const pullRequests = new Map<number, PullRequestObservation>();
  try {
    for (const number of numbers) {
      const view = viewOf(runner(context.gh, 'gh'), number);
      const unread = { queue: 'none', ejections: 0, reviewFailures: 0, files: [] } as const;
      pullRequests.set(number, { ...view, ...unread });
    }
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the loop cannot freeze without knowing what GitHub would still merge',
      error instanceof Error ? error.message : String(error),
      `disarm by hand, ${numbers.map((number) => `\`gh pr merge ${number} --disable-auto\``)
        .join(', ')}, then stop acting`,
    );
  }
  const github = { base: program.autopilot.base, mergeQueue: false, pullRequests };
  const sharedState = { current, before: new Map<string, SharedFingerprint>() };
  const armed = new Map<string, ArmedRecord>();
  for (const ticket of tracker.tickets) {
    const record = recordedArm(context.root, ticket.id);
    if (record !== undefined) armed.set(ticket.id, record);
  }
  const decision = decideLoop({ program, tracker, github, signal: 'now', sharedState, armed });
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
 * `autopilot review-key`: draw the review key once, in this checkout.
 *
 * The private half is written once, mode 0600, under `.void/machine/`, which
 * git must ignore: a key a commit could carry is refused before it exists. The
 * public half is written to `.github/void-review.pub`, for a person to commit
 * in a pull request they merge into the base, since the loop never merges a
 * change to `.github/`. A second run draws nothing: it rewrites the public
 * half from the private one and prints its fingerprint. Replacing the key is
 * deleting the private file by hand, deliberately, never a flag an agent passes.
 */
export function reviewKeyCommand(context: LoopRunners): LoopCommandOutput {
  requireOrchestrationCheckout(context, 'autopilot review-key');
  const git = runner(context.git, 'git');
  const privatePath = join(context.root, REVIEW_KEY_PATH);
  let ignored = false;
  try {
    git(['check-ignore', '--quiet', '--no-index', REVIEW_KEY_PATH]);
    ignored = true;
  } catch {
    ignored = false;
  }
  if (!ignored) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the private review key would not be ignored by git',
      `${REVIEW_KEY_PATH} is not covered by any ignore rule`,
      'ignore `.void/machine/` (the harness install does), then run it again',
    );
  }
  const existing = readIfPresent(privatePath);
  const drawn = existing === undefined ? generateReviewKey() : undefined;
  if (drawn !== undefined && !writeOnce(privatePath, drawn.privateKey, 0o600)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'another run drew the review key at the same time',
      `${REVIEW_KEY_PATH} appeared while this one was drawing`,
      'run `autopilot review-key` again; it reads the key already drawn',
    );
  }
  const publicKey = publicKeyOf(existing ?? drawn?.privateKey ?? '');
  writeAtomically(join(context.root, REVIEW_PUBLIC_KEY_PATH), publicKey);
  const fingerprint = keyFingerprint(publicKey);
  return {
    value: { created: drawn !== undefined, fingerprint, publicKeyPath: REVIEW_PUBLIC_KEY_PATH },
    human:
      `review key ${fingerprint}${drawn === undefined ? '' : ' drawn'}\n` +
      `commit ${REVIEW_PUBLIC_KEY_PATH} in a pull request a person merges into the base\n`,
  };
}

function viewOf(gh: (args: readonly string[]) => string, number: number) {
  const fields = PULL_REQUEST_FIELDS.join(',');
  return parsePullRequestView(gh(['pr', 'view', String(number), '--json', fields]));
}

/**
 * `autopilot arm --ticket <id> --pr <n> --head <sha>`: the kernel's
 * `enable-auto-merge`. GitHub keeps no armed head, so it is recorded first,
 * then the merge is armed on exactly that head, then GitHub is read back: an
 * auto-merge it does not show is a failure, and one whose head moved while
 * arming is disarmed at once. The kernel disarms later whatever this record
 * no longer vouches for.
 */
export function armCommand(argv: readonly string[], context: LoopRunners): LoopCommandOutput {
  const ticket = flagValue(argv, '--ticket');
  const head = flagValue(argv, '--head');
  if (ticket === undefined || head === undefined || !SHA_PATTERN.test(head)) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot arm needs the ticket, the pull request and the full head SHA the kernel named',
      ticket === undefined ? '--ticket was not given' : '--head is missing or not a full SHA',
      'copy them from the `enable-auto-merge` action: `--ticket <id> --pr <n> --head <sha>`',
    );
  }
  const number = pullRequestNumber(argv, 'autopilot arm');
  const path = armedPath(context.root, ticket);
  const gh = runner(context.gh, 'gh');
  const before = viewOf(gh, number);
  if (before.state !== 'open' || before.headSha !== head) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `#${number} is not the pull request the kernel approved`,
      before.state !== 'open'
        ? `#${number} is ${before.state}`
        : `its head is ${before.headSha}, not ${head}`,
      'ask `autopilot next` again; it arms only the head it just read',
    );
  }
  writeAtomically(path, `${JSON.stringify({ pullRequest: number, headSha: head })}\n`);
  gh(['pr', 'merge', String(number), '--auto', '--match-head-commit', head]);
  const after = viewOf(gh, number);
  if (after.autoMerge && after.headSha !== head) {
    gh(['pr', 'merge', String(number), '--disable-auto']);
  }
  if (!after.autoMerge || after.headSha !== head) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `#${number} is not armed on ${head}`,
      after.autoMerge
        ? `its head moved to ${after.headSha} while arming; it was disarmed`
        : 'GitHub shows no auto-merge',
      'ask `autopilot next` again before arming anything',
    );
  }
  return {
    value: { ticketId: ticket, pullRequest: number, headSha: head },
    human: `#${number} armed on ${head}\n`,
  };
}

/**
 * `autopilot disarm --pr <n>`: the kernel's `disable-auto-merge`. It disarms,
 * then reads GitHub back and fails while the auto-merge is still there. A pull
 * request already disarmed is left alone.
 */
export function disarmCommand(argv: readonly string[], context: LoopRunners): LoopCommandOutput {
  const number = pullRequestNumber(argv, 'autopilot disarm');
  const gh = runner(context.gh, 'gh');
  const before = viewOf(gh, number);
  if (!before.autoMerge) {
    return {
      value: { pullRequest: number, headSha: before.headSha, disarmed: false },
      human: `#${number} holds no auto-merge\n`,
    };
  }
  gh(['pr', 'merge', String(number), '--disable-auto']);
  const after = viewOf(gh, number);
  if (after.autoMerge) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      `#${number} is still armed`,
      'GitHub still shows an auto-merge request after --disable-auto',
      'disarm it by hand in GitHub, then ask `autopilot next` again',
    );
  }
  return {
    value: { pullRequest: number, headSha: after.headSha, disarmed: true },
    human: `#${number} disarmed at ${after.headSha}\n`,
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

/**
 * `autopilot verdict --ticket <id> --pr <n>`: the only path that writes a review verdict.
 *
 * The verdict on stdin is admitted, then bound to the head the pull request has
 * now: a verdict on any other head judged code that is no longer there. The
 * comment carries a signature by this checkout's review key over the
 * repository, the ticket, the pull request, the head, the outcome and the
 * findings, which the loop and the required job both verify: a status and a
 * comment alone are what anyone could post. It runs only here, where the
 * private key is. The comment goes first and the status second, so a failure
 * between the two leaves a signed comment no status confirms, which neither
 * believes, rather than a status with no verdict behind it. The job that
 * enforces the status is re-run when its completed run disagrees, because a
 * status event starts no workflow.
 */
export function verdictCommand(
  argv: readonly string[],
  stdin: string,
  context: LoopRunners,
): LoopCommandOutput {
  const value = jsonFrom(stdin, 'verdict');
  const number = pullRequestNumber(argv);
  const ticket = flagValue(argv, '--ticket');
  const ticketId = ticketIdSchema.safeParse(ticket);
  if (!ticketId.success) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      'autopilot verdict needs the ticket the pull request carries',
      ticket === undefined ? '--ticket was not given' : `${JSON.stringify(ticket)} is not a ticket`,
      'pass it as `--ticket <id>`; the signature binds it',
    );
  }
  // What was given is read first, what this checkout holds second.
  requireOrchestrationCheckout(context, 'autopilot verdict');
  const privateKey = readIfPresent(join(context.root, REVIEW_KEY_PATH));
  if (privateKey === undefined) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'this checkout holds no review key',
      `${REVIEW_KEY_PATH} is absent`,
      'draw it once with `autopilot review-key` and have a person merge the public half',
    );
  }
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
  const clean = verdict.blocking.length === 0;
  const state = clean ? 'success' : 'failure';
  const repository = repositoryName(gh);
  const signature = signVerdict(privateKey, {
    repository,
    ticketId: ticketId.data,
    pullRequest: number,
    headSha: verdict.headSha,
    state,
    verdictDigest: verdictDigest(verdict),
    signedAt: context.now ?? new Date().toISOString(),
  });
  const body =
    `${renderJudgmentComment('review-verdict', verdict)}${renderSignature(signature)}\n`;
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
