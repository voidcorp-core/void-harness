#!/usr/bin/env node
// Merge authority of one pull request into develop, for the promotion audit in
// promotion.yml: every commit the promotion carries entered develop through a
// merged pull request, and that pull request must have had the right to merge.
//
// Three ways hold, and nothing else:
// - its head SHA carries a successful `independent-review` check run from the
//   review App, the review the required check demanded before it could merge
//   (promotion.yml filters the check suites by that App's id), whoever merged
//   it and whatever its timeline says: `gh pr merge --auto` on a pull request
//   already mergeable merges at once and records no AutoMergeEnabledEvent;
// - the named human merged it by hand, with no automatic merge ever armed;
// - it is the release back-merge, proved by the same construction the
//   independent-review job checks (scripts/independent-review-check.mjs),
//   replayed against develop as it stood: the integration's first parent.
//   One that does not hold falls back to the verdict, since it was merged
//   automatically too.
//
// Every doubt refuses: a missing field, an unreadable check, a timeline the
// query could not read in full, a git error. A missing verdict is never read
// as approval.
// Refs: https://docs.github.com/en/graphql/reference/objects#pullrequest
// https://docs.github.com/en/graphql/reference/enums#pullrequesttimelineitemsitemtype

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  BACK_MERGE,
  backMergeRefusal,
  latestReviewConclusion,
  REVIEW_CHECK_NAME,
} from './independent-review-check.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
// Arming either one hands the merge to GitHub rather than to a person.
const AUTOMATIC_EVENTS = new Set(['AutoMergeEnabledEvent', 'AddedToMergeQueueEvent']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function field(value, key) {
  return isObject(value) ? value[key] : undefined;
}

const isSha = (value) => typeof value === 'string' && SHA_PATTERN.test(value);

/** The automatic-merge events, or a reason the timeline cannot be trusted. */
function automaticEvents(pull) {
  const timeline = field(pull, 'timelineItems');
  const nodes = field(timeline, 'nodes');
  if (!Array.isArray(nodes)) return { refused: 'its timeline is unreadable' };
  if (field(field(timeline, 'pageInfo'), 'hasNextPage') !== false) {
    return { refused: 'its timeline was not read in full' };
  }
  return { count: nodes.filter((node) => AUTOMATIC_EVENTS.has(field(node, '__typename'))).length };
}

/** The same identity promotion.yml always required of the back-merge. */
function isBackMergeBranch(pull) {
  return field(pull, 'baseRefName') === BACK_MERGE.base
    && field(pull, 'headRefName') === BACK_MERGE.head
    && field(field(pull, 'headRepository'), 'nameWithOwner') === BACK_MERGE.repository
    && field(field(pull, 'headRepositoryOwner'), 'login') === BACK_MERGE.repository.split('/')[0]
    && field(pull, 'isCrossRepository') === false;
}

/** Why the back-merge's commits are not what back-merge.yml builds, or undefined. */
function backMergeProof(pull, integrationOid, git) {
  const head = field(pull, 'headRefOid');
  if (!isSha(head)) return 'its head SHA is unreadable';
  let develop;
  try {
    develop = String(git(['rev-parse', '--verify', `${integrationOid}^1`])).trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return `develop before it merged is unreadable: ${reason}`;
  }
  if (!isSha(develop)) return 'develop before it merged is unreadable';
  return backMergeRefusal(git, head, { develop, fetch: false });
}

/** Why the head SHA carries no successful review check, or undefined when it does. */
function verdictRefusal(pull) {
  const head = field(pull, 'headRefOid');
  if (!isSha(head)) return 'its head SHA is unreadable';
  const nodes = field(field(pull, 'commits'), 'nodes');
  const commit = Array.isArray(nodes) && nodes.length === 1 ? field(nodes[0], 'commit') : undefined;
  if (field(commit, 'oid') !== head) return `the checks of its head ${head} were not read`;
  let conclusion;
  try {
    conclusion = latestReviewConclusion(commit, head);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (conclusion === undefined) return `its head ${head} carries no ${REVIEW_CHECK_NAME} check`;
  if (conclusion !== 'SUCCESS') return `the ${REVIEW_CHECK_NAME} check on its head ${head} is ${conclusion}`;
  return undefined;
}

/**
 * `{ accepted: 'human' | 'review-verdict' | 'back-merge' }` or `{ refused }`
 * for a merged pull request into develop, as promotion.yml reads it.
 */
export function promotionAuthority(pull, { integrationOid, human, git }) {
  if (!isObject(pull)) return { refused: 'the pull request is unreadable' };
  const number = field(pull, 'number');
  const label = Number.isInteger(number) ? `PR #${number}` : 'the pull request';
  const events = automaticEvents(pull);
  if (events.refused !== undefined) return { refused: `${label}: ${events.refused}` };

  let notBackMerge = '';
  if (isBackMergeBranch(pull)) {
    const refused = backMergeProof(pull, integrationOid, git);
    if (refused === undefined) return { accepted: 'back-merge' };
    notBackMerge = ` (not the back-merge back-merge.yml builds: ${refused})`;
  }

  const unverified = verdictRefusal(pull);
  if (unverified === undefined) return { accepted: 'review-verdict' };
  if (events.count > 0) {
    return { refused: `${label} was merged automatically and ${unverified}${notBackMerge}` };
  }

  const merger = field(field(pull, 'mergedBy'), 'login');
  if (typeof human === 'string' && human !== '' && merger === human) return { accepted: 'human' };
  return {
    refused: `${label} was merged by ${typeof merger === 'string' ? merger : 'nobody known'}, `
      + `not ${String(human)}, and armed no automatic merge${notBackMerge}`,
  };
}

// CLI for promotion.yml: the pull request JSON on stdin, the integration commit
// as argument, the accepted path on stdout; a refusal exits 1 with its reason.
function main() {
  const [integrationOid] = process.argv.slice(2);
  const human = process.env.EXPECTED_HUMAN;
  let pull;
  try {
    pull = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    pull = undefined;
  }
  const verdict = isSha(integrationOid)
    ? promotionAuthority(pull, {
      integrationOid,
      human,
      git: (args) => execFileSync('git', args, { encoding: 'utf8', timeout: 120_000 }),
    })
    : { refused: `integration commit ${String(integrationOid)} is not a full SHA` };
  if (verdict.accepted !== undefined) {
    process.stdout.write(`${verdict.accepted}\n`);
    return;
  }
  process.stderr.write(`promotion authority: ${verdict.refused}\n`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
