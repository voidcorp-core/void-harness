#!/usr/bin/env node
// The independent review of one pull request, as a GitHub Actions job.
//
// .github/workflows/independent-review.yml runs this on `pull_request_target`:
// the workflow and this script come from the base branch, the pull request head
// is checked out beside them and read, never executed, and Claude reviews it
// with read-only tools. The verdict is published as a check run named
// `independent-review` on the head SHA, created with the job's `GITHUB_TOKEN`,
// hence by the GitHub Actions app, the only source branch protection accepts
// for that check. No key exists anywhere to steal: a token with write access
// can post a comment or a commit status, never a check run as that app.
//
// `start` decides whether this head is reviewed and opens the check; `finish`
// admits what the reviewer returned, posts it as the verdict comment the loop
// reads, and concludes the check. Every doubt fails the check: a verdict that
// is missing, malformed or out of bounds is a failure, never an approval.
// Refs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target
// https://docs.github.com/en/rest/checks/runs
// https://code.claude.com/docs/en/github-actions

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { backMergeRefusal, eventBackMerge, REVIEW_CHECK_NAME } from './independent-review-check.mjs';

// The bounds of `admitReviewVerdict` (packages/cli/src/lib/autopilot/judgments.ts),
// restated because this script runs from the base branch alone; a contract test
// renders a verdict here and admits it there.
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const LOCATION_PATTERN = /^[^\s:]+:[1-9][0-9]*$/;
const LOCATION_MAX = 512;
const TEXT_MAX = 500;
const BLOCKING_MAX = 32;
const ADVISORY_MAX = 64;
const VERDICT_OPENING = '<!-- void-autopilot:review-verdict -->';
const VERDICT_CLOSING = '<!-- /void-autopilot:review-verdict -->';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether this head is reviewed: `review`, or why not. A draft gets no check at
 * all, so it stays unmergeable until it is marked ready, which reruns this. A
 * fork's head is a stranger's code and is left to a person.
 */
export function decideStart({ event, repository, git }) {
  const pull = event?.pull_request;
  const number = pull?.number;
  const headSha = pull?.head?.sha;
  if (!Number.isInteger(number) || typeof headSha !== 'string' || !SHA_PATTERN.test(headSha)) {
    throw new Error('independent-review: the event carries no pull request number and head SHA');
  }
  const base = { number, headSha };
  if (eventBackMerge(pull, repository)) {
    const refused = git === undefined ? 'no git to read its commits' : backMergeRefusal(git, headSha);
    if (refused === undefined) return { ...base, kind: 'exempt' };
  }
  if (pull.head?.repo?.full_name !== repository) return { ...base, kind: 'fork' };
  if (pull.draft === true) return { ...base, kind: 'draft' };
  return { ...base, kind: 'review' };
}

const text = (value) => typeof value === 'string' && value.trim() !== '' && value.length <= TEXT_MAX;
const place = (value) =>
  typeof value === 'string' && value.length <= LOCATION_MAX && LOCATION_PATTERN.test(value);

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/**
 * The verdict the reviewer returned, bound to the head this job read, or why
 * it is refused. The head and the round are the job's facts, never the model's.
 */
export function admitVerdict(output, { headSha, round }) {
  let value;
  try {
    value = typeof output === 'string' ? JSON.parse(output) : undefined;
  } catch {
    return { ok: false, reason: 'the reviewer returned no JSON verdict' };
  }
  if (!isObject(value) || !onlyKeys(value, ['blocking', 'advisory'])) {
    return { ok: false, reason: 'the verdict is not an object of blocking and advisory findings' };
  }
  const { blocking, advisory } = value;
  if (!Array.isArray(blocking) || blocking.length > BLOCKING_MAX) {
    return { ok: false, reason: `blocking is not a list of at most ${BLOCKING_MAX} findings` };
  }
  if (!Array.isArray(advisory) || advisory.length > ADVISORY_MAX) {
    return { ok: false, reason: `advisory is not a list of at most ${ADVISORY_MAX} findings` };
  }
  const blockingValid = blocking.every((finding) => isObject(finding)
    && onlyKeys(finding, ['location', 'scenario', 'correction'])
    && place(finding.location) && text(finding.scenario) && text(finding.correction));
  if (!blockingValid) return { ok: false, reason: 'a blocking finding lacks a file:line, a scenario or a correction' };
  const advisoryValid = advisory.every((finding) => isObject(finding)
    && onlyKeys(finding, ['location', 'note'])
    && (finding.location === undefined || place(finding.location)) && text(finding.note));
  if (!advisoryValid) return { ok: false, reason: 'an advisory finding lacks a note or has a malformed location' };
  return { ok: true, verdict: { headSha, round, blocking, advisory } };
}

/** The comment the loop reads back: the block `judgment-comment.ts` renders. */
export function renderVerdictComment(verdict) {
  const json = JSON.stringify(verdict, undefined, 2);
  return `${VERDICT_OPENING}\n\`\`\`json\n${json}\n\`\`\`\n${VERDICT_CLOSING}\n`;
}

/** What the check says: success only on a verdict with no blocking finding. */
export function conclusionOf(admission) {
  if (!admission.ok) {
    return { conclusion: 'failure', title: 'The review produced no admissible verdict', summary: admission.reason };
  }
  const { blocking, advisory } = admission.verdict;
  if (blocking.length > 0) {
    const lines = blocking.map((finding) => `- \`${finding.location}\`: ${finding.scenario}`);
    return { conclusion: 'failure', title: `${blocking.length} blocking finding(s)`, summary: lines.join('\n') };
  }
  return {
    conclusion: 'success',
    title: 'No blocking finding',
    summary: advisory.length === 0 ? 'Nothing to report.' : `${advisory.length} advisory finding(s) in the verdict comment.`,
  };
}

/** Every verdict block the review job posted, oldest first; unreadable ones are skipped. */
function postedVerdicts(bodies) {
  return bodies.flatMap((body) => {
    const start = body.indexOf(VERDICT_OPENING);
    if (start === -1) return [];
    const json = /```json\n([\s\S]*?)\n```/.exec(body.slice(start))?.[1];
    try {
      const value = JSON.parse(json ?? '');
      return isObject(value) && Array.isArray(value.blocking) ? [value] : [];
    } catch {
      return [];
    }
  });
}

/** The blocking findings of the latest other head that was blocked, or undefined. */
export function previousBlocking(bodies, headSha) {
  const blocked = postedVerdicts(bodies)
    .filter((verdict) => verdict.headSha !== headSha && verdict.blocking.length > 0);
  return blocked.at(-1)?.blocking;
}

/** Round 2 once this pull request already carries a blocking verdict on another head. */
export function roundOf(bodies, headSha) {
  return previousBlocking(bodies, headSha) === undefined ? 1 : 2;
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000, input });
}

function api(method, path, body) {
  const args = ['api', '--method', method, path, '--input', '-'];
  return JSON.parse(gh(args, JSON.stringify(body ?? {})) || '{}');
}

/** The comments this job posted on a pull request: only the Actions bot's count. */
function botComments(repository, number) {
  const comments = JSON.parse(gh(['api', `repos/${repository}/issues/${number}/comments?per_page=100`]));
  return comments.filter((comment) => comment.user?.login === 'github-actions[bot]')
    .map((comment) => String(comment.body));
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

function start() {
  const repository = process.env.GITHUB_REPOSITORY;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', timeout: 120_000 });
  const decision = decideStart({ event, repository, git });
  const path = `repos/${repository}/check-runs`;
  const check = { name: REVIEW_CHECK_NAME, head_sha: decision.headSha, details_url: runUrl() };
  if (decision.kind === 'exempt') {
    const outcome = { title: 'Release back-merge', summary: 'Its commits are the release a person merged; no review is due.' };
    api('POST', path, { ...check, status: 'completed', conclusion: 'success', output: outcome });
  } else if (decision.kind === 'fork') {
    const outcome = { title: 'Pull request from a fork', summary: 'A stranger\'s head is reviewed by a person, not by this job.' };
    api('POST', path, { ...check, status: 'completed', conclusion: 'failure', output: outcome });
  } else if (decision.kind === 'review') {
    const previous = previousBlocking(botComments(repository, decision.number), decision.headSha);
    mkdirSync('review', { recursive: true });
    if (previous !== undefined) {
      writeFileSync('review/previous-blocking.json', `${JSON.stringify(previous, undefined, 2)}\n`);
    }
    const created = api('POST', path, { ...check, status: 'in_progress' });
    output('check_run_id', String(created.id));
  }
  output('review', decision.kind === 'review' ? 'true' : 'false');
  process.stdout.write(`independent-review: #${decision.number} ${decision.headSha} ${decision.kind}\n`);
}

function finish() {
  const repository = process.env.GITHUB_REPOSITORY;
  const number = Number(process.env.PULL_NUMBER);
  const headSha = process.env.HEAD_SHA ?? '';
  const checkRunId = process.env.CHECK_RUN_ID ?? '';
  const bodies = botComments(repository, number);
  const admission = admitVerdict(process.env.REVIEW_OUTPUT, { headSha, round: roundOf(bodies, headSha) });
  if (admission.ok) {
    api('POST', `repos/${repository}/issues/${number}/comments`, { body: renderVerdictComment(admission.verdict) });
  }
  const { conclusion, title, summary } = conclusionOf(admission);
  api('PATCH', `repos/${repository}/check-runs/${checkRunId}`, {
    status: 'completed', conclusion, output: { title, summary },
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## independent-review: ${title}\n\n${summary}\n`);
  }
  process.stdout.write(`independent-review: #${number} ${headSha} ${conclusion}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    if (process.argv[2] === 'start') start();
    else if (process.argv[2] === 'finish') finish();
    else throw new Error(`independent-review: unknown step ${String(process.argv[2])}`);
  } catch (error) {
    process.stdout.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
