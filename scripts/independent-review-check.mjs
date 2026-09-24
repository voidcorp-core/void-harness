#!/usr/bin/env node
// Required check `independent-review` in the merge queue: prove that the
// independent review passed on the exact head SHA of every pull request the
// group about to merge contains.
//
// The review is a GitHub Actions job (.github/workflows/independent-review.yml,
// on `pull_request_target`): it reads the pull request head without executing
// it and publishes its verdict as a check run named `independent-review` on
// that head. Branch protection requires that check from the GitHub Actions app,
// but any workflow of the repository runs as that app: one pushed to a
// throwaway branch could create the check on another pull request's head. So
// in the queue the check is not what is believed. On `merge_group` the group is
// walked back through the merge queue, entry by entry, and every pull request it
// contains must have a completed run of the review workflow itself whose
// provenance GitHub alone sets: the file `.github/workflows/independent-review.yml`,
// the event `pull_request_target`, the title that workflow gives its runs from
// the pull request and head it reviewed, and a workflow commit develop holds, so
// the file that ran is develop's and not one a pull request aimed at another
// base carries. The latest such run must have succeeded, which it does only when
// the review blocked nothing. This job never runs on `pull_request`: a job there
// that skipped would report success under the required name.
//
// Every doubt fails: an unknown event, a malformed ref, an API error, an entry
// missing from the queue, a review run absent, running or from anywhere else.
// A missing review is never read as approval.
//
// One pull request needs no review: the release back-merge (back-merge.yml),
// which carries only the release output a person approved by merging the
// release pull request. It is recognised by what GitHub reports and a pull
// request cannot choose: opened by the release App's bot account, matched by
// its numeric id, from `chore/back-merge-main` in this repository into develop.
// Then its commits are proved in git, because anyone who can push to that
// branch could add one the author check alone would let through unread: the
// head is on main already (develop had nothing unreleased, so the merge
// fast-forwarded), or it is a merge whose first parent is on develop, whose
// second is on main, whose tree is the merge of the two, and it is the only
// commit of the pull request that main does not hold. Any doubt, a git error
// included, demands a review like any other pull request.
// Refs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group
// https://docs.github.com/en/graphql/reference/objects#mergequeueentry
// https://docs.github.com/en/graphql/reference/objects#checksuite

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The check the review job publishes on a pull request head, and the one protection requires. */
export const REVIEW_CHECK_NAME = 'independent-review';
/**
 * The GitHub Actions app, the only source branch protection accepts for the
 * review check (`app_id` 15368 on the required check). A check run is created
 * by an app; the `GITHUB_TOKEN` of a workflow creates it as this one.
 */
export const GITHUB_ACTIONS_APP_ID = 15368;
/** The review workflow, the only one whose runs are believed in the queue. */
export const REVIEW_WORKFLOW = '.github/workflows/independent-review.yml';
/** The title the review workflow gives a run, from the pull request and head it reviews. */
export const reviewRunTitle = (number, sha) => `independent-review #${number} ${sha}`;
// Runs read per pull request, newest first: a head is reviewed on the push that
// made it, so its run is among the latest. One older than this is not found,
// and the queue refuses rather than reads further.
const RUN_PAGES_MAX = 5;
const RUNS_PER_PAGE = 100;

// Observed on every back-merge so far (#287 to #379). The login carries the
// `[bot]` suffix only in REST, which a user account cannot register.
export const BACK_MERGE = {
  repository: 'voidcorp-core/void-harness',
  head: 'chore/back-merge-main',
  base: 'develop',
  main: 'main',
  botId: 311374965,
  restLogin: 'voidcorp-release[bot]',
  graphqlLogin: 'voidcorp-release',
};

// A queue holds at most 100 entries per page; a longer queue is refused rather
// than paged, because a truncated walk could miss a pull request of the group.
const QUEUE_PAGE_SIZE = 100;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUEUE_REF_PATTERN =
  /^(?:refs\/heads\/)?gh-readonly-queue\/(.+)\/pr-([1-9]\d*)-([0-9a-f]{40})$/;

// Every review check run the GitHub Actions app left on a commit. Paged by
// bounds rather than by cursor: a head carries one suite per workflow run of
// the app and one review run per push, far below them; a count above the page
// is refused rather than read short.
const SUITES_MAX = 50;
const RUNS_MAX = 20;
const REVIEW_QUERY = `query($owner: String!, $name: String!, $oid: GitObjectID!, $app: Int!, $check: String!) {
  repository(owner: $owner, name: $name) {
    object(oid: $oid) {
      ... on Commit {
        oid
        checkSuites(first: ${SUITES_MAX}, filterBy: { appId: $app }) {
          totalCount
          nodes {
            checkRuns(first: ${RUNS_MAX}, filterBy: { checkName: $check }) {
              totalCount
              nodes { status conclusion completedAt }
            }
          }
        }
      }
    }
  }
}`;

// The queue and the head of its branch are read in one request, so the walk is
// checked against the branch as it stood when the queue was read.
const QUEUE_QUERY = `query($owner: String!, $name: String!, $branch: String!, $qualified: String!) {
  repository(owner: $owner, name: $name) {
    mergeQueue(branch: $branch) {
      entries(first: ${QUEUE_PAGE_SIZE}) {
        totalCount
        nodes {
          headCommit { oid } baseCommit { oid }
          pullRequest {
            number headRefOid headRefName baseRefName isCrossRepository
            author { __typename login ... on Bot { databaseId } }
          }
        }
      }
    }
    ref(qualifiedName: $qualified) { target { oid } }
  }
}`;

function fail(message) {
  throw new Error(`independent-review: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function field(value, key) {
  return isObject(value) ? value[key] : undefined;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) fail(`${label} is not a full SHA`);
  return value;
}

function branchName(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('refs/heads/')) {
    fail(`merge group base ref ${String(ref)} is not a branch ref`);
  }
  return ref.slice('refs/heads/'.length);
}

export function parseQueueRef(ref) {
  const match = typeof ref === 'string' ? QUEUE_REF_PATTERN.exec(ref) : undefined;
  if (!match) fail(`${String(ref)} is not a merge queue ref`);
  const [, base, number, sha] = match;
  return { base, number: Number(number), sha };
}

function splitRepository(repository) {
  const parts = typeof repository === 'string' ? repository.split('/') : [];
  if (parts.length !== 2 || parts.some((part) => part === '')) {
    fail(`repository ${String(repository)} is not owner/name`);
  }
  return { owner: parts[0], name: parts[1] };
}

async function query(graphql, text, variables) {
  let response;
  try {
    response = await graphql(text, variables);
  } catch (error) {
    fail(`GitHub API call failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const repository = field(field(response, 'data'), 'repository');
  if (!isObject(repository)) fail('GitHub API returned no repository data');
  return repository;
}

/**
 * The conclusion of the latest completed review check on a commit as GraphQL
 * returns it with the suites filtered to the GitHub Actions app: `SUCCESS`,
 * another conclusion, `PENDING` while every run is still going, undefined when
 * there is none. Pure, so the promotion audit reads a commit the same way.
 */
export function latestReviewConclusion(commit, sha) {
  const suites = field(commit, 'checkSuites');
  const nodes = field(suites, 'nodes');
  if (!Array.isArray(nodes)) fail(`the check suites of ${sha} are unreadable`);
  if (field(suites, 'totalCount') !== nodes.length) fail(`${sha} carries more than ${SUITES_MAX} check suites`);
  const runs = nodes.flatMap((suite) => {
    const checkRuns = field(suite, 'checkRuns');
    const list = field(checkRuns, 'nodes');
    if (!Array.isArray(list) || field(checkRuns, 'totalCount') !== list.length) {
      fail(`the review check runs of ${sha} are unreadable or exceed ${RUNS_MAX}`);
    }
    return list;
  });
  const completed = runs
    .filter((run) => field(run, 'status') === 'COMPLETED' && typeof field(run, 'completedAt') === 'string')
    .sort((left, right) => Date.parse(field(left, 'completedAt')) - Date.parse(field(right, 'completedAt')));
  if (completed.length === 0) return runs.length === 0 ? undefined : 'PENDING';
  const conclusion = field(completed.at(-1), 'conclusion');
  return typeof conclusion === 'string' ? conclusion : undefined;
}

/** The latest review check conclusion on a commit, read from GitHub. */
export async function reviewCheckState(graphql, coordinates, sha) {
  const variables = { ...coordinates, oid: sha, app: GITHUB_ACTIONS_APP_ID, check: REVIEW_CHECK_NAME };
  const repository = await query(graphql, REVIEW_QUERY, variables);
  const commit = field(repository, 'object');
  if (field(commit, 'oid') !== sha) fail(`commit ${sha} is unknown to GitHub`);
  return latestReviewConclusion(commit, sha);
}

async function restCall(rest, path) {
  try {
    return await rest(path);
  } catch (error) {
    return fail(`GitHub API call failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The latest completed run of the review workflow for this head, or undefined. */
async function latestReviewRun(rest, coordinates, pull) {
  const title = reviewRunTitle(pull.number, pull.sha);
  const base = `repos/${coordinates.owner}/${coordinates.name}/actions/workflows/independent-review.yml/runs`;
  const matching = [];
  for (let page = 1; page <= RUN_PAGES_MAX; page += 1) {
    const query = `event=pull_request_target&status=completed&per_page=${RUNS_PER_PAGE}&page=${page}`;
    const runs = field(await restCall(rest, `${base}?${query}`), 'workflow_runs');
    if (!Array.isArray(runs)) fail('the review workflow runs are unreadable');
    matching.push(...runs.filter((run) => field(run, 'display_title') === title
      && field(run, 'event') === 'pull_request_target'
      && field(run, 'path') === REVIEW_WORKFLOW
      && field(run, 'status') === 'completed'));
    if (runs.length < RUNS_PER_PAGE) break;
  }
  const order = (run) => [Date.parse(String(field(run, 'created_at'))), Number(field(run, 'run_attempt'))];
  matching.sort((left, right) => {
    const [a, b] = [order(left), order(right)];
    return a[0] - b[0] || a[1] - b[1];
  });
  return matching.at(-1);
}

/** Whether `sha` is on `branch`: the workflow file that ran is then the branch's. */
async function onBranch(rest, coordinates, branch, sha) {
  const path = `repos/${coordinates.owner}/${coordinates.name}/compare/${branch}...${sha}`;
  const status = field(await restCall(rest, path), 'status');
  return status === 'behind' || status === 'identical';
}

async function requireReview(rest, coordinates, pull, base) {
  const label = `#${pull.number} head ${pull.sha}`;
  const why = pull.refused === undefined ? '' : ` (not exempt as the back-merge: ${pull.refused})`;
  const run = await latestReviewRun(rest, coordinates, pull);
  if (run === undefined) fail(`${label} has no completed run of ${REVIEW_WORKFLOW}${why}`);
  const conclusion = field(run, 'conclusion');
  if (conclusion !== 'success') fail(`${label}: its latest review run concluded ${String(conclusion)}`);
  const workflowSha = requireSha(field(run, 'head_sha'), `${label} review run commit`);
  if (!(await onBranch(rest, coordinates, base, workflowSha))) {
    fail(`${label}: its review run ran a workflow from ${workflowSha}, which ${base} does not hold`);
  }
}

/** The back-merge, from the queue's GraphQL view of a pull request. */
function queuedBackMerge(pull, repository) {
  const author = field(pull, 'author');
  return repository === BACK_MERGE.repository
    && field(pull, 'headRefName') === BACK_MERGE.head
    && field(pull, 'baseRefName') === BACK_MERGE.base
    && field(pull, 'isCrossRepository') === false
    && field(author, '__typename') === 'Bot'
    && field(author, 'login') === BACK_MERGE.graphqlLogin
    && field(author, 'databaseId') === BACK_MERGE.botId;
}

/** The back-merge, from the REST view a `pull_request` event carries. */
export function eventBackMerge(pull, repository) {
  const user = field(pull, 'user');
  return repository === BACK_MERGE.repository
    && field(field(pull, 'head'), 'ref') === BACK_MERGE.head
    && field(field(field(pull, 'head'), 'repo'), 'full_name') === BACK_MERGE.repository
    && field(field(pull, 'base'), 'ref') === BACK_MERGE.base
    && field(user, 'type') === 'Bot'
    && field(user, 'login') === BACK_MERGE.restLogin
    && field(user, 'id') === BACK_MERGE.botId;
}

function readEntry(node, repository) {
  const pull = field(node, 'pullRequest');
  const number = field(pull, 'number');
  if (!Number.isInteger(number)) fail('merge queue entry has no pull request number');
  return {
    number,
    head: field(field(node, 'headCommit'), 'oid'),
    base: field(field(node, 'baseCommit'), 'oid'),
    sha: requireSha(field(pull, 'headRefOid'), `#${number} head`),
    exempt: queuedBackMerge(pull, repository),
  };
}

async function queueEntries(graphql, coordinates, branch) {
  const nameWithOwner = `${coordinates.owner}/${coordinates.name}`;
  const variables = { ...coordinates, branch, qualified: `refs/heads/${branch}` };
  const repository = await query(graphql, QUEUE_QUERY, variables);
  const entries = field(field(repository, 'mergeQueue'), 'entries');
  const nodes = field(entries, 'nodes');
  if (!Array.isArray(nodes)) fail(`${branch} has no readable merge queue`);
  if (field(entries, 'totalCount') !== nodes.length) {
    fail(`${branch} merge queue exceeds ${QUEUE_PAGE_SIZE} entries`);
  }
  const branchHead = requireSha(field(field(field(repository, 'ref'), 'target'), 'oid'), branch);
  return { entries: nodes.map((node) => readEntry(node, nameWithOwner)), branchHead };
}

// The group commit of an entry is built on the group commit of the entry ahead
// of it, down to the base branch. Following `baseCommit` therefore lists every
// pull request the tested commit contains. The walk must end exactly on the
// current head of the branch: stopping anywhere else means an entry ahead was
// not found, and its pull request, merged into the tested commit, was never
// checked. A walk that revisits an entry is a cycle, not a group.
function groupFrom({ entries, branchHead }, headSha, branch) {
  const first = entries.find((entry) => entry.head === headSha);
  if (first === undefined) fail(`no merge queue entry has head ${headSha}`);
  const group = [first];
  for (let step = 0; step < entries.length; step += 1) {
    const base = group[group.length - 1].base;
    if (base === branchHead) return group;
    const ahead = entries.find((entry) => entry.head === base);
    if (ahead === undefined) {
      fail(`the merge group walk stops at ${String(base)}, not the head of ${branch}`
        + ` (${branchHead})`);
    }
    if (group.includes(ahead)) fail(`the merge queue entries form a cycle at #${ahead.number}`);
    group.push(ahead);
  }
  return fail(`the merge group walk does not reach the head of ${branch} within the queue`);
}

async function mergeGroupPulls(event, graphql, coordinates) {
  const group = field(event, 'merge_group');
  const headSha = requireSha(field(group, 'head_sha'), 'merge group head');
  const queued = parseQueueRef(field(group, 'head_ref'));
  const base = branchName(field(group, 'base_ref'));
  if (queued.base !== base) {
    fail(`queue ref targets ${queued.base} but the merge group targets ${base}`);
  }
  const pulls = groupFrom(await queueEntries(graphql, coordinates, base), headSha, base);
  if (pulls[0].number !== queued.number) {
    fail(`queue ref names #${queued.number} but the queue entry is #${pulls[0].number}`);
  }
  return pulls.map(({ number, sha, exempt }) => ({ number, sha, exempt }));
}

const remoteRef = (branch) => `refs/remotes/origin/${branch}`;

/** Runs git; a failure is a reason, never an exception that could skip the check. */
function attempt(git, args) {
  try {
    return { out: String(git(args)).trim() };
  } catch (error) {
    return { error: error instanceof Error ? error.message.split('\n')[0] : String(error) };
  }
}

const isAncestor = (git, commit, target) =>
  attempt(git, ['merge-base', '--is-ancestor', commit, target]).error === undefined;

/**
 * Why the head of an identified back-merge is not the output of back-merge.yml,
 * or undefined when it is: on main already, or the clean merge of a develop
 * commit and a main commit, with nothing else main does not hold.
 *
 * `develop` is develop as the back-merge found it: the branch itself before it
 * merges, the first parent of its integration commit once it has (the
 * promotion audit). `fetch: false` reads a checkout that already holds both.
 */
export function backMergeRefusal(git, sha, options = {}) {
  const { develop = remoteRef(BACK_MERGE.base), fetch = true } = options;
  const { base, main } = BACK_MERGE;
  if (fetch) {
    const fetched = attempt(git, ['fetch', '--no-tags', '--quiet', 'origin',
      `+refs/heads/${main}:${remoteRef(main)}`, `+refs/heads/${base}:${remoteRef(base)}`, sha]);
    if (fetched.error !== undefined) return `its commits could not be fetched: ${fetched.error}`;
  }
  if (isAncestor(git, sha, remoteRef(main))) return undefined;
  const parents = attempt(git, ['rev-list', '--parents', '-n', '1', sha]);
  const [, first, second, ...more] = (parents.out ?? '').split(' ');
  if (first === undefined || second === undefined || more.length > 0) {
    return 'its head is not on main and is not a merge of two parents';
  }
  if (!isAncestor(git, first, develop)) return `its first parent ${first} is not on ${base}`;
  if (!isAncestor(git, second, remoteRef(main))) {
    return `its second parent ${second} is not on ${main}`;
  }
  const unheld = attempt(git, ['rev-list', sha, `^${develop}`, `^${remoteRef(main)}`]);
  if (unheld.out !== sha) return `it holds commits neither ${main} nor ${base} holds`;
  const tree = attempt(git, ['rev-parse', `${sha}^{tree}`]).out;
  const merged = attempt(git, ['merge-tree', '--write-tree', first, second]);
  if (merged.error !== undefined) return `its parents do not merge cleanly: ${merged.error}`;
  if (tree === undefined || merged.out?.split('\n')[0] !== tree) {
    return 'its tree is not the merge of its parents';
  }
  return undefined;
}

export async function checkIndependentReview({ eventName, event, repository, graphql, rest, git }) {
  const coordinates = splitRepository(repository);
  if (eventName !== 'merge_group') fail(`unsupported event ${String(eventName)}; the review itself runs on pull_request_target`);
  const pulls = await mergeGroupPulls(event, graphql, coordinates);
  const base = branchName(field(field(event, 'merge_group'), 'base_ref'));
  for (const pull of pulls) {
    if (!pull.exempt) continue;
    const refused = git === undefined ? 'no git to read its commits' : backMergeRefusal(git, pull.sha);
    if (refused !== undefined) Object.assign(pull, { exempt: false, refused });
  }
  for (const pull of pulls) {
    if (!pull.exempt) await requireReview(rest, coordinates, pull, base);
  }
  return pulls.map(({ number, sha, exempt }) =>
    exempt ? { number, sha, exempt: 'back-merge' } : { number, sha });
}

function ghGraphql(text, variables) {
  const args = ['api', 'graphql', '-f', `query=${text}`];
  // `-F` sends a number as a GraphQL Int; everything else stays a string.
  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
  }
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000 }));
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) fail('GITHUB_EVENT_PATH is unset');
  const pulls = await checkIndependentReview({
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(eventPath, 'utf8')),
    repository: process.env.GITHUB_REPOSITORY,
    graphql: async (text, variables) => ghGraphql(text, variables),
    rest: async (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', timeout: 30_000 })),
    git: (args) => execFileSync('git', args, { encoding: 'utf8', timeout: 120_000 }),
  });
  for (const pull of pulls) {
    const outcome = pull.exempt === undefined ? 'approved' : `exempt (${pull.exempt})`;
    process.stdout.write(`independent-review: #${pull.number} ${pull.sha} ${outcome}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`::error::${message}\n`);
    process.exitCode = 1;
  });
}
