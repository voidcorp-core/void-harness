#!/usr/bin/env node
// Required check `independent-review`: prove that the independent reviewer
// approved the exact head SHA of every pull request about to merge.
//
// The reviewer posts a commit status named `void/independent-review` on the
// head SHA it read. On `pull_request` that SHA is the pull request head. On
// `merge_group` the checks run on a synthetic group commit nobody reviewed, so
// the group is walked back through the merge queue, entry by entry, and every
// pull request it contains must carry the verdict on its own head SHA.
//
// Every doubt fails: an unknown event, a malformed ref, an API error, an entry
// missing from the queue. A missing verdict is never read as approval.
//
// One pull request needs no verdict: the release back-merge (back-merge.yml),
// which carries only the release output a person approved by merging the
// release pull request. It is recognised by what GitHub reports and a pull
// request cannot choose: opened by the release App's bot account, matched by
// its numeric id, from `chore/back-merge-main` in this repository into develop.
// Refs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group
// https://docs.github.com/en/graphql/reference/objects#mergequeueentry
// https://docs.github.com/en/graphql/reference/objects#status

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const VERDICT_CONTEXT = 'void/independent-review';

// Observed on every back-merge so far (#287 to #379). The login carries the
// `[bot]` suffix only in REST, which a user account cannot register.
const BACK_MERGE = {
  repository: 'voidcorp-core/void-harness',
  head: 'chore/back-merge-main',
  base: 'develop',
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

const STATUS_QUERY = `query(
  $owner: String!, $name: String!, $oid: GitObjectID!, $context: String!
) {
  repository(owner: $owner, name: $name) {
    object(oid: $oid) { ... on Commit { oid status { context(name: $context) { state } } } }
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

async function verdictState(graphql, coordinates, sha) {
  const variables = { ...coordinates, oid: sha, context: VERDICT_CONTEXT };
  const repository = await query(graphql, STATUS_QUERY, variables);
  const commit = field(repository, 'object');
  if (field(commit, 'oid') !== sha) fail(`commit ${sha} is unknown to GitHub`);
  const state = field(field(field(commit, 'status'), 'context'), 'state');
  return typeof state === 'string' ? state : undefined;
}

async function requireVerdict(graphql, coordinates, pull) {
  const state = await verdictState(graphql, coordinates, pull.sha);
  const label = `#${pull.number} head ${pull.sha}`;
  if (state === undefined) fail(`${label} carries no ${VERDICT_CONTEXT} verdict`);
  if (state !== 'SUCCESS') fail(`${label}: ${VERDICT_CONTEXT} verdict is ${state}`);
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
function eventBackMerge(pull, repository) {
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

function pullRequestPulls(event, repository) {
  const pull = field(event, 'pull_request');
  const number = field(pull, 'number');
  if (!Number.isInteger(number)) fail('pull request event has no number');
  const sha = requireSha(field(field(pull, 'head'), 'sha'), 'pull request head SHA');
  return [{ number, sha, exempt: eventBackMerge(pull, repository) }];
}

export async function checkIndependentReview({ eventName, event, repository, graphql }) {
  const coordinates = splitRepository(repository);
  let pulls = [];
  if (eventName === 'pull_request') pulls = pullRequestPulls(event, repository);
  else if (eventName === 'merge_group') pulls = await mergeGroupPulls(event, graphql, coordinates);
  else fail(`unsupported event ${String(eventName)}`);
  for (const pull of pulls) if (!pull.exempt) await requireVerdict(graphql, coordinates, pull);
  return pulls.map(({ number, sha, exempt }) =>
    exempt ? { number, sha, exempt: 'back-merge' } : { number, sha });
}

function ghGraphql(text, variables) {
  const args = ['api', 'graphql', '-f', `query=${text}`];
  for (const [key, value] of Object.entries(variables)) args.push('-f', `${key}=${value}`);
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
