// What GitHub says about the loop's pull requests, read through `gh`.
//
// GitHub is the authority on a merge, so the kernel reads it itself rather than
// taking a model's word for it. The parsers are pure and validate every field
// they read: a shape they do not recognise is a refusal naming the field, never
// a guess, because a guessed `mergeStateStatus` is a merge decided on nothing.
// The runner is injected so the whole adapter is exercised on real captures.
//
// gh 2.100: `gh pr view --json` exposes no merge queue field, so the queue is
// read with `gh api graphql`: `repository.mergeQueue(branch)` for its presence,
// `pullRequest.timelineItems` for the last queue event of each pull request and
// the ejections of its head, `pullRequest.commits` for its review rounds, and
// `pullRequest.isInMergeQueue` where the armed state itself is at stake: once
// the checks pass, arming queues the pull request and leaves no
// `autoMergeRequest` for `gh pr view` to show.
// https://docs.github.com/en/graphql/reference/objects#mergequeue
// https://docs.github.com/en/graphql/reference/objects#removedfrommergequeueevent

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { selectBase } from './base-selection.js';
import { autopilotFailure } from './errors.js';
import { judgmentsOf, latestJudgment } from './judgment-comment.js';
import { admitReviewVerdict } from './judgments.js';
import type {
  ChangedFile,
  GithubObservation,
  PullRequestObservation,
  QueueEvent,
} from './loop.js';
import type { SharedStateReading } from './shared-state.js';

/** Runs `gh` (or `git`) with argv, never through a shell, and returns its stdout. */
export type GhRunner = (args: readonly string[]) => string;
export type GitRunner = (args: readonly string[]) => string;

/** The only fields the loop reads, requested as they are named by `gh`. */
export const PULL_REQUEST_FIELDS = [
  'number',
  'state',
  'isDraft',
  'headRefName',
  'headRefOid',
  'baseRefName',
  'mergeStateStatus',
  'autoMergeRequest',
  'statusCheckRollup',
  'comments',
  // Not `files`: gh names only the destination of a rename, so the files are
  // read through REST, which names the source too.
  'changedFiles',
] as const;

/**
 * The review check, a check run the review job creates on the head with its
 * GITHUB_TOKEN: GitHub Actions is its only source, and branch protection
 * accepts it from nowhere else. It is the review, not a job enforcing one.
 */
export const REVIEW_CHECK_NAME = 'independent-review';
/** The account the review job posts its verdict comment as, as `gh pr view` names it. */
export const REVIEW_AUTHOR = 'github-actions';

/** A loop holds four slots; this bounds one tick's reads with room to spare. */
const PULL_REQUESTS_MAX = 32;
const GH_TIMEOUT_MS = 30_000;
const GH_OUTPUT_MAX = 16 * 1024 * 1024;

const checkRunSchema = z.object({
  __typename: z.literal('CheckRun'),
  name: z.string(),
  status: z.string(),
  conclusion: z.string(),
  // Read only on the review job, where a GitHub Actions run URL names the run.
  detailsUrl: z.unknown().optional(),
});

// `https://github.com/<owner>/<repo>/actions/runs/<run>/job/<id>`: the run is
// what `gh run rerun <run> --failed` takes. The trailing id is not a job id gh
// accepts (see `gh run rerun --help`), so it is not read.
const ACTIONS_RUN_URL = /\/actions\/runs\/([1-9][0-9]{0,18})\//;

const statusContextSchema = z.object({
  __typename: z.literal('StatusContext'),
  context: z.string(),
  state: z.enum(['SUCCESS', 'PENDING', 'EXPECTED', 'FAILURE', 'ERROR']),
});

const pullRequestViewSchema = z.object({
  number: z.int().positive(),
  state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
  isDraft: z.boolean(),
  headRefName: z.string().min(1),
  headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
  baseRefName: z.string().min(1),
  mergeStateStatus: z.enum([
    'BEHIND', 'BLOCKED', 'CLEAN', 'DIRTY', 'DRAFT', 'HAS_HOOKS', 'UNKNOWN', 'UNSTABLE',
  ]),
  autoMergeRequest: z.object({}).nullable(), // allow-null: gh reports no auto-merge as JSON null
  statusCheckRollup: z.array(
    z.discriminatedUnion('__typename', [checkRunSchema, statusContextSchema]),
  ),
  // Oldest first, as gh prints them: the body for judgment blocks, the author
  // to tell the review job's verdict from anyone else's text.
  comments: z.array(z.object({
    body: z.string(),
    author: z.object({ login: z.string() }).nullable().optional(), // allow-null: a deleted account
  })),
  // GitHub's own count, which tells the kernel a file list was cut short.
  changedFiles: z.int().nonnegative(),
});

/**
 * One page of `GET /repos/{owner}/{repo}/pulls/{number}/files`. A renamed file
 * carries `previous_filename`, the ground it leaves.
 * https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files
 */
const pullRequestFilesSchema = z
  .array(z.object({ filename: z.string().min(1), previous_filename: z.string().min(1).optional() }))
  .max(100);

/** REST serves at most 100 files a page. */
const PULL_REQUEST_FILES_PER_PAGE = 100;
/**
 * Pages read per pull request: 1 000 files, far beyond a loop unit. A longer
 * list stays short, and the kernel holds a short list back as protected.
 */
export const PULL_REQUEST_FILE_PAGES_MAX = 10;

type RollupEntry = z.infer<typeof pullRequestViewSchema>['statusCheckRollup'][number];
type CheckState = 'pending' | 'passing' | 'failing';

// Check run conclusions that do not hold a merge back, per the GitHub docs on
// required status checks: success, neutral and skipped all satisfy one.
const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

function checkStateOf(entry: RollupEntry): CheckState {
  if (entry.__typename === 'CheckRun') {
    if (entry.status !== 'COMPLETED') return 'pending';
    return PASSING_CONCLUSIONS.has(entry.conclusion) ? 'passing' : 'failing';
  }
  if (entry.state === 'SUCCESS') return 'passing';
  return entry.state === 'PENDING' || entry.state === 'EXPECTED' ? 'pending' : 'failing';
}

function checksOf(rollup: readonly RollupEntry[]): CheckState {
  const states = rollup
    .filter((entry) =>
      entry.__typename !== 'CheckRun' || entry.name !== REVIEW_CHECK_NAME,
    )
    .map(checkStateOf);
  if (states.includes('failing')) return 'failing';
  // Nothing registered yet is not a pass: the checks of a fresh push are pending.
  if (states.length === 0 || states.includes('pending')) return 'pending';
  return 'passing';
}

/** The review check on the head, and the Actions run that published it. */
function reviewOf(
  rollup: readonly RollupEntry[],
): Pick<PullRequestObservation, 'review' | 'reviewCheckRun'> {
  const check = rollup.find(
    (entry) => entry.__typename === 'CheckRun' && entry.name === REVIEW_CHECK_NAME,
  );
  if (check === undefined || check.__typename !== 'CheckRun') return { review: 'absent' };
  const url = typeof check.detailsUrl === 'string' ? check.detailsUrl : '';
  const run = ACTIONS_RUN_URL.exec(url)?.[1];
  const state = checkStateOf(check);
  const review = state === 'passing' ? 'success' : state === 'failing' ? 'failure' : 'pending';
  return { review, ...(run === undefined ? {} : { reviewCheckRun: Number(run) }) };
}

function unreadable(what: string, cause: string): never {
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    `the ${what} reported by gh is unreadable`,
    cause,
    'check the gh version and authentication (`gh auth status`), then run the loop again',
  );
}

function parseJson<T>(what: string, schema: z.ZodType<T>, text: string): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return unreadable(what, error instanceof Error ? error.message : 'not JSON');
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return unreadable(what, issues.join('; '));
}

/** Every admissible verdict the review job posted, oldest first. */
function postedVerdicts(comments: readonly PullRequestComment[]) {
  return comments
    .filter((comment) => comment.author?.login === REVIEW_AUTHOR)
    .flatMap((comment) => judgmentsOf([comment.body], 'review-verdict'))
    .flatMap((raw) => {
      const admission = admitReviewVerdict(raw);
      return admission.ok ? [admission.value] : [];
    });
}

/**
 * The verdict the review job posted last on this head, when the review check
 * on the same head agrees with it: clean with success, blocking with failure.
 * The check is what branch protection trusts; the comment carries the findings
 * a worker answers, so one that disagrees with the check is believed nowhere.
 */
function believedVerdict(
  comments: readonly PullRequestComment[],
  headSha: string,
  review: PullRequestObservation['review'],
): unknown {
  if (review !== 'success' && review !== 'failure') return undefined;
  const latest = postedVerdicts(comments).filter((verdict) => verdict.headSha === headSha).at(-1);
  if (latest === undefined) return undefined;
  return (latest.blocking.length === 0) === (review === 'success') ? latest : undefined;
}

/**
 * The review rounds a pull request used: its distinct heads the review job
 * blocked. Read from what the job posted, so a job that failed without a
 * verdict, a crash the loop re-runs, is not a round.
 */
function reviewRoundsOf(comments: readonly PullRequestComment[]): number {
  const blocked = postedVerdicts(comments).filter((verdict) => verdict.blocking.length > 0);
  return new Set(blocked.map((verdict) => verdict.headSha)).size;
}

/** One page of a pull request's files, each rename with its source. */
export function parsePullRequestFiles(text: string): ChangedFile[] {
  return parseJson('pull request files', pullRequestFilesSchema, text).map((entry) =>
    entry.previous_filename === undefined
      ? { path: entry.filename }
      : { path: entry.filename, previousPath: entry.previous_filename },
  );
}

/**
 * The files GitHub counts, page by page, up to the bound. A page shorter than
 * a full one is the last; what the bound leaves unread keeps the list short.
 */
function readPullRequestFiles(run: GhRunner, number: number, changedFiles: number): ChangedFile[] {
  const files: ChangedFile[] = [];
  const pages = Math.min(
    Math.ceil(changedFiles / PULL_REQUEST_FILES_PER_PAGE),
    PULL_REQUEST_FILE_PAGES_MAX,
  );
  for (let page = 1; page <= pages; page += 1) {
    const query = `per_page=${PULL_REQUEST_FILES_PER_PAGE}&page=${page}`;
    const entries = parsePullRequestFiles(
      run(['api', `repos/{owner}/{repo}/pulls/${number}/files?${query}`]),
    );
    files.push(...entries);
    if (entries.length < PULL_REQUEST_FILES_PER_PAGE) break;
  }
  return files;
}


type PullRequestComment = z.infer<typeof pullRequestViewSchema>['comments'][number];

/**
 * One `gh pr view --json <PULL_REQUEST_FIELDS>` answer, without its GraphQL and
 * REST parts. The verdict and the rounds are read from the review job's own
 * comments, the review from the check it published.
 */
export function parsePullRequestView(
  text: string,
): Omit<PullRequestObservation, 'queue' | 'ejections' | 'files'> {
  const view = parseJson('pull request', pullRequestViewSchema, text);
  const bodies = view.comments.map((comment) => comment.body);
  const { review, reviewCheckRun } = reviewOf(view.statusCheckRollup);
  const verdict = believedVerdict(view.comments, view.headRefOid, review);
  const conflict = latestJudgment(bodies, 'conflict-class');
  return {
    ...(verdict === undefined ? {} : { verdict }),
    ...(conflict === undefined ? {} : { conflict }),
    number: view.number,
    state: view.state === 'OPEN' ? 'open' : view.state === 'MERGED' ? 'merged' : 'closed',
    draft: view.isDraft,
    headRef: view.headRefName,
    headSha: view.headRefOid,
    baseRef: view.baseRefName,
    conflicted: view.mergeStateStatus === 'DIRTY',
    behind: view.mergeStateStatus === 'BEHIND',
    autoMerge: view.autoMergeRequest !== null, // allow-null: the absence gh reports
    checks: checksOf(view.statusCheckRollup),
    review,
    ...(reviewCheckRun === undefined ? {} : { reviewCheckRun }),
    reviewFailures: reviewRoundsOf(view.comments),
    changedFiles: view.changedFiles,
  };
}

const runAttemptSchema = z.object({ attempt: z.int().positive() });

/** The attempt of one Actions run, from `gh run view <run> --json attempt`. */
export function parseRunAttempt(text: string): number {
  return parseJson('run attempt', runAttemptSchema, text).attempt;
}

const graphqlErrors = z.array(z.object({ message: z.string() })).max(64).optional();

const mergeQueueSchema = z.object({
  data: z.object({
    repository: z.object({ mergeQueue: z.object({}).nullable() }), // allow-null: no queue
  }),
  errors: graphqlErrors,
});

/** Whether the base has a merge queue: `mergeQueue` is null when it has none. */
export function parseMergeQueuePresence(text: string): boolean {
  const answer = parseJson('merge queue', mergeQueueSchema, text);
  if (answer.errors !== undefined) {
    return unreadable('merge queue', answer.errors.map((error) => error.message).join('; '));
  }
  return answer.data.repository.mergeQueue !== null; // allow-null: see above
}

const queueMembershipSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({ id: z.string().min(1), isInMergeQueue: z.boolean() }),
    }),
  }),
  errors: graphqlErrors,
});

/** Whether a pull request sits in its base's merge queue, and the node id that dequeues it. */
export interface QueueMembership {
  readonly nodeId: string;
  readonly queued: boolean;
}

export function parseQueueMembership(text: string): QueueMembership {
  const answer = parseJson('merge queue membership', queueMembershipSchema, text);
  if (answer.errors !== undefined) {
    const cause = answer.errors.map((error) => error.message).join('; ');
    return unreadable('merge queue membership', cause);
  }
  const { id, isInMergeQueue } = answer.data.repository.pullRequest;
  return { nodeId: id, queued: isInMergeQueue };
}

/** One pull request's merge queue membership, read now rather than from its timeline. */
export function readQueueMembership(run: GhRunner, number: number): QueueMembership {
  const args = ['api', 'graphql', ...REPOSITORY_FIELDS, '-F', `number=${number}`];
  return parseQueueMembership(run([...args, '-f', `query=${QUEUE_MEMBERSHIP_QUERY}`]));
}

const timelineNodeSchema = z.discriminatedUnion('__typename', [
  z.object({ __typename: z.literal('AddedToMergeQueueEvent') }),
  z.object({ __typename: z.literal('RemovedFromMergeQueueEvent'), reason: z.string() }),
  z.object({ __typename: z.literal('PullRequestCommit') }),
  z.object({ __typename: z.literal('HeadRefForcePushedEvent') }),
]);

const timelineSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({ timelineItems: z.object({ nodes: z.array(timelineNodeSchema) }) }),
    }),
  }),
  errors: graphqlErrors,
});

/**
 * The last queue event of a pull request, unless a commit came after it.
 *
 * A removal for any reason but `merged` is an ejection the worker has to answer;
 * a later commit is that answer, so it closes the episode.
 */
export function parseQueueTimeline(text: string): QueueEvent {
  const answer = parseJson('pull request timeline', timelineSchema, text);
  if (answer.errors !== undefined) {
    const messages = answer.errors.map((error) => error.message).join('; ');
    return unreadable('pull request timeline', messages);
  }
  const last = answer.data.repository.pullRequest.timelineItems.nodes.at(-1);
  if (last?.__typename === 'AddedToMergeQueueEvent') return 'queued';
  if (last?.__typename !== 'RemovedFromMergeQueueEvent') return 'none';
  return last.reason === 'merged' ? 'none' : 'ejected';
}

/**
 * The ejections of the current head: removals from the queue for any reason but
 * `merged`, since the last commit or force push. A re-queue does not reset the
 * count, because the head it re-queued is the same one.
 */
export function parseEjections(text: string): number {
  const answer = parseJson('pull request timeline', timelineSchema, text);
  if (answer.errors !== undefined) {
    const messages = answer.errors.map((error) => error.message).join('; ');
    return unreadable('pull request timeline', messages);
  }
  const nodes = answer.data.repository.pullRequest.timelineItems.nodes;
  let ejections = 0;
  for (const node of [...nodes].reverse()) {
    if (node.__typename === 'PullRequestCommit' || node.__typename === 'HeadRefForcePushedEvent') {
      break;
    }
    if (node.__typename === 'RemovedFromMergeQueueEvent' && node.reason !== 'merged') {
      ejections += 1;
    }
  }
  return ejections;
}

const QUEUE_QUERY = `query($owner: String!, $name: String!, $branch: String!) {
  repository(owner: $owner, name: $name) { mergeQueue(branch: $branch) { url } }
}`;

const QUEUE_MEMBERSHIP_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { id isInMergeQueue } }
}`;

/**
 * Queue events and commits read per pull request: enough to see past the bound
 * on ejections. A window with no commit in it undercounts only beyond that bound.
 */
const TIMELINE_WINDOW = 20;

const TIMELINE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      timelineItems(last: ${TIMELINE_WINDOW}, itemTypes: [ADDED_TO_MERGE_QUEUE_EVENT,
        REMOVED_FROM_MERGE_QUEUE_EVENT, PULL_REQUEST_COMMIT, HEAD_REF_FORCE_PUSHED_EVENT]) {
        nodes { __typename ... on RemovedFromMergeQueueEvent { reason } }
      }
    }
  }
}`;

// gh fills `{owner}` and `{repo}` from the current repository.
const REPOSITORY_FIELDS = ['-F', 'owner={owner}', '-F', 'name={repo}'] as const;

function observed<T>(what: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      `GitHub could not be observed for ${what}`,
      error instanceof Error ? error.message : String(error),
      'the loop decides on a complete observation only; fix gh access and run it again',
    );
  }
}

const classicChecksSchema = z.object({ strict: z.boolean() });
const branchRulesSchema = z.array(
  z.object({ type: z.string(), parameters: z.unknown().optional() }),
);

const strictParameters = z.object({ strict_required_status_checks_policy: z.literal(true) });

/**
 * Without a merge queue the loop merges one pull request at a time, and that is
 * only safe when the base refuses a pull request that is not up to date: a
 * second one would otherwise merge on a combination no check ever ran. GitHub
 * says so in two places, classic protection (`strict`, readable with admin
 * rights) and rulesets (`strict_required_status_checks_policy`, readable by
 * anyone); either one suffices. Nothing readable saying so is a refusal.
 * https://docs.github.com/en/rest/branches/branch-protection#get-status-checks-protection
 * https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch
 */
function requireUpToDateBase(run: GhRunner, base: string): void {
  const causes: string[] = [];
  const read = <T>(
    what: string,
    schema: z.ZodType<T>,
    args: readonly string[],
  ): T | undefined => {
    try {
      return parseJson(what, schema, run(args));
    } catch (error) {
      causes.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const classicEndpoint = `repos/{owner}/{repo}/branches/${base}/protection/required_status_checks`;
  const classicArgs = ['api', classicEndpoint];
  const classic = read('classic protection', classicChecksSchema, classicArgs);
  if (classic?.strict === true) return;
  if (classic !== undefined) causes.push('classic protection: `strict` is false');
  const rulesArgs = ['api', `repos/{owner}/{repo}/rules/branches/${base}`];
  const rules = read('branch rules', branchRulesSchema, rulesArgs);
  const strict = rules?.some(
    (rule) =>
      rule.type === 'required_status_checks' && strictParameters.safeParse(rule.parameters).success,
  );
  if (strict === true) return;
  if (rules !== undefined) {
    causes.push('branch rules: no required status check demands an up to date branch');
  }
  throw autopilotFailure(
    'AUTOPILOT_PROGRAM',
    `${base} has no merge queue and does not require a branch up to date before merging`,
    causes.join('; '),
    `turn on the merge queue for ${base}, or require branches to be up to date before merging`,
  );
}

export interface GithubRequest {
  readonly base: string;
  readonly pullRequests: readonly number[];
}

/** One tick's view of GitHub: the queue once, then each pull request and its queue event. */
export function observeGithub(run: GhRunner, request: GithubRequest): GithubObservation {
  if (request.pullRequests.length > PULL_REQUESTS_MAX) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the loop was asked to observe too many pull requests',
      `${request.pullRequests.length} requested, at most ${PULL_REQUESTS_MAX}`,
      'report only the tickets that hold a slot',
    );
  }
  const queueArgs = ['api', 'graphql', ...REPOSITORY_FIELDS, '-F', `branch=${request.base}`];
  const mergeQueue = observed('the merge queue', () =>
    parseMergeQueuePresence(run([...queueArgs, '-f', `query=${QUEUE_QUERY}`])),
  );
  const pullRequests = new Map<number, PullRequestObservation>();
  for (const number of request.pullRequests) {
    const viewArgs = ['pr', 'view', String(number), '--json', PULL_REQUEST_FIELDS.join(',')];
    const view = observed(`#${number}`, () => parsePullRequestView(run(viewArgs)));
    const timelineArgs = ['api', 'graphql', ...REPOSITORY_FIELDS, '-F', `number=${number}`];
    const timeline = observed(`#${number}`, () =>
      run([...timelineArgs, '-f', `query=${TIMELINE_QUERY}`]),
    );
    // The timeline tells an ejection apart; whether the pull request sits in
    // the queue now is read from GitHub, where a timeline window can lag.
    const queued =
      mergeQueue && observed(`#${number}`, () => readQueueMembership(run, number).queued);
    const event = observed(`#${number}`, () => parseQueueTimeline(timeline));
    const queue = queued ? 'queued' : event === 'queued' ? 'none' : event;
    const ejections = observed(`#${number}`, () => parseEjections(timeline));
    // Read only when the loop may re-run the review: a review that failed and
    // posted no verdict on this head crashed rather than judged.
    const crashed = view.review === 'failure' && view.verdict === undefined;
    const checkRun = crashed ? view.reviewCheckRun : undefined;
    const attempt =
      checkRun === undefined
        ? {}
        : {
            reviewCheckAttempt: observed(`#${number}`, () =>
              parseRunAttempt(run(['run', 'view', String(checkRun), '--json', 'attempt'])),
            ),
          };
    const files = observed(`#${number}`, () => readPullRequestFiles(run, number, view.changedFiles));
    pullRequests.set(number, { ...view, files, queue, ejections, ...attempt });
  }
  if (!mergeQueue) requireUpToDateBase(run, request.base);
  return { base: request.base, mergeQueue, pullRequests };
}

/**
 * The branch the loop merges into. `auto` is develop, then main, through the
 * same `selectBase` the cluster engine uses, so one word means one thing.
 */
export function resolveLoopBase(run: GhRunner, requested: string): string {
  if (requested !== 'auto') return requested;
  const branches = ['develop', 'main'].flatMap((name) => {
    try {
      const endpoint = `repos/{owner}/{repo}/branches/${name}`;
      const sha = run(['api', endpoint, '--jq', '.commit.sha']).trim();
      return [{ name, headSha: sha }];
    } catch {
      // A branch gh cannot find is absent; `selectBase` decides what that means.
      return [];
    }
  });
  const selection = selectBase({ requested, branches });
  if (selection.kind === 'selected') return selection.branch;
  throw autopilotFailure(
    'AUTOPILOT_PROGRAM',
    'the loop has no base to merge into',
    selection.detail,
    'set `autopilot.base` to an existing branch in the programme',
  );
}

/** The real runner: argv only, bounded in time and output. */
export function execGh(args: readonly string[]): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GH_TIMEOUT_MS,
    maxBuffer: GH_OUTPUT_MAX,
  });
}

/** The shared parts git prints directly; `hooks` and `info` are files, read apart. */
type CommandPart = Exclude<keyof SharedStateReading, 'hooks' | 'info'>;

function sharedStateCommands(
  bases: readonly string[],
): Readonly<Record<CommandPart, readonly string[]>> {
  const refFormat = '--format=%(objectname) %(refname)';
  return {
    // `--includes`: `--local` alone skips the files `include.path` names, and a
    // unit could change what every worktree reads through one of them.
    config: ['config', '--local', '--includes', '--list'],
    stash: ['stash', 'list', '--format=%H'],
    tags: ['for-each-ref', refFormat, 'refs/tags'],
    notes: ['for-each-ref', refFormat, 'refs/notes'],
    remotes: ['remote', '-v'],
    bases: ['for-each-ref', refFormat, ...bases.map((base) => `refs/heads/${base}`)],
    replace: ['for-each-ref', refFormat, 'refs/replace'],
  };
}

/** A hooks or info directory holds a handful of files; more is not a Git directory. */
const SHARED_FILES_MAX = 512;

/**
 * One line per file, `<sha256> <path>`, sorted: the content is hashed here and
 * never leaves this function. A symbolic link is read as its target, not followed.
 */
function directoryDigests(directory: string): string {
  if (!existsSync(directory)) return '';
  const entries = readdirSync(directory, { recursive: true, encoding: 'utf8' });
  if (entries.length > SHARED_FILES_MAX) {
    throw new Error(`${directory} holds more than ${SHARED_FILES_MAX} entries`);
  }
  return entries
    .flatMap((entry) => {
      const path = join(directory, entry);
      const stat = lstatSync(path);
      if (stat.isDirectory()) return [];
      const content = stat.isSymbolicLink() ? `link:${readlinkSync(path)}` : readFileSync(path);
      const hash = createHash('sha256').update(content).digest('hex');
      return [`${hash} ${relative(directory, path)}`];
    })
    .sort()
    .join('\n');
}

export interface SharedStateRequest {
  /** The local branches units must not move: the loop's base candidates. */
  readonly bases: readonly string[];
}

/**
 * What git reports for each part the workers of a repository share.
 *
 * Worker branches are deliberately not read: they are each unit's own output.
 * Remote-tracking refs are not read either, since any fetch moves them.
 */
export function readSharedState(run: GitRunner, request: SharedStateRequest): SharedStateReading {
  const attempt = <T>(what: string, read: () => T): T => {
    try {
      return read();
    } catch (error) {
      throw autopilotFailure(
        'AUTOPILOT_INPUT',
        'the shared Git state could not be read',
        `${what} failed: ${error instanceof Error ? error.message : String(error)}`,
        'run the loop from inside the repository its workers share',
      );
    }
  };
  // `for-each-ref` with no pattern lists every ref, workers' branches included.
  if (request.bases.length === 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the shared Git state was read without a base branch',
      'no base was named, so the local refs a unit must not move are unknown',
      'pass the loop base candidates from the programme',
    );
  }
  const commands = sharedStateCommands(request.bases);
  const read = (part: CommandPart): string =>
    attempt(`\`git ${commands[part].join(' ')}\``, () => run(commands[part]));
  const commonArgs = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  const common = attempt('`git rev-parse --git-common-dir`', () => run(commonArgs).trim());
  return {
    config: read('config'),
    stash: read('stash'),
    tags: read('tags'),
    notes: read('notes'),
    remotes: read('remotes'),
    bases: read('bases'),
    replace: read('replace'),
    hooks: attempt('reading hooks/', () => directoryDigests(join(common, 'hooks'))),
    info: attempt('reading info/', () => directoryDigests(join(common, 'info'))),
  };
}

/** The real git runner for one checkout: argv only, bounded in time and output. */
export function gitIn(root: string): GitRunner {
  return (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GH_TIMEOUT_MS,
      maxBuffer: GH_OUTPUT_MAX,
    });
}
