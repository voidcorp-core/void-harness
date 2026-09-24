import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A merge queue only merges once every required check reports on the
// `merge_group` event. A required check whose workflow ignores that event
// blocks the queue forever; one that runs but reads pull_request-only context
// can pass on an empty base. These assertions pin both sides.
// Ref: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function triggers(source: string): string {
  return source.split(/^jobs:/m)[0] ?? '';
}

function job(source: string, name: string): string {
  const start = source.indexOf(`\n  ${name}:\n`);
  if (start < 0) return '';
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

// A GitHub Actions expression, spelled out so the source holds no `${` literal.
function expression(inner: string): string {
  return ['$', '{{ ', inner, ' }}'].join('');
}

const MERGE_GROUP =
  /^ {2}merge_group:\n {4}types: \[checks_requested\]\n {4}branches: \[develop\]$/m;

describe('merge queue readiness on develop', () => {
  // `validate` and the three `install conformance` jobs live in ci.yml,
  // `enforce` in void-enforce.yml, the queue's `independent-review` in its own.
  it.each(['ci.yml', 'void-enforce.yml', 'independent-review-queue.yml'])('%s answers merge groups on develop', (name) => {
    expect(triggers(read(`.github/workflows/${name}`))).toMatch(MERGE_GROUP);
  });

  it('proves decision immutability against the merge group base', () => {
    const decisions = job(read('.github/workflows/ci.yml'), 'validate');
    expect(decisions).toContain(
      `DECISIONS_BASE: ${expression(
        'github.event.pull_request.base.sha || github.event.merge_group.base_sha',
      )}`,
    );
  });

  it('diffs enforce against the merge group base instead of failing on no base', () => {
    const action = read('.github/actions/void-enforce/action.yml');
    expect(action).toContain(
      `MERGE_GROUP_BASE_SHA: ${expression('github.event.merge_group.base_sha')}`,
    );
    expect(action).toMatch(/base="\$\{MERGE_GROUP_BASE_SHA:-\}"/);
  });
});

describe('independent review', () => {
  const reviewSource = read('.github/workflows/independent-review.yml');
  const queueSource = read('.github/workflows/independent-review-queue.yml');
  const review = job(reviewSource, 'review');
  const queued = job(queueSource, 'independent-review');

  // A job skipped under a required name reports success, so the required name
  // exists only where it always runs: the queue workflow, on merge groups alone.
  it('runs the required name only on merge groups, and reviews under another name', () => {
    expect(triggers(queueSource)).toMatch(MERGE_GROUP);
    expect(triggers(queueSource)).not.toMatch(/pull_request/);
    expect(queued).not.toMatch(/^ {4}if:/m);
    expect(job(reviewSource, 'independent-review')).toBe('');
    for (const name of ['ci.yml', 'void-enforce.yml']) {
      expect(read(`.github/workflows/${name}`)).not.toMatch(/\n {2}independent-review:\n/);
    }
  });

  // The workflow, the scripts and the instructions come from the base, and the
  // head is data in a subdirectory: nothing the pull request controls runs with
  // the model credential.
  it('reviews from the base branch, with the head checked out as data only', () => {
    expect(triggers(reviewSource)).toMatch(/^ {2}pull_request_target:\n {4}branches: \[develop\]$/m);
    expect(review).toContain(`ref: ${expression('github.event.pull_request.head.sha')}`);
    expect(review).toContain('path: pr-head');
    expect(review).not.toMatch(/pnpm|npm (?:ci|install)|node pr-head/);
    expect(review).toContain('--allowedTools Read,Grep,Glob');
    expect(review).toContain('--add-dir pr-head');
    expect(review).toMatch(/uses: anthropics\/claude-code-action@[0-9a-f]{40} /);
  });

  // The queue believes a run of this workflow by its title; a draft or fork
  // head must never end as a successful run under that title.
  it('titles each run with the pull request and head, and skips drafts outright', () => {
    // A draft's run is titled apart, so the queue can never read it as the
    // review of that head, whatever GitHub concludes a run with no job.
    expect(reviewSource).toContain(
      `run-name: independent-review #${expression('github.event.pull_request.number')} ${expression('github.event.pull_request.head.sha')}${expression("github.event.pull_request.draft && ' (draft)' || ''")}`,
    );
    expect(review).toContain(`if: ${expression('github.event.pull_request.draft == false')}`);
  });

  // A repository secret is readable by any workflow pushed to any branch; one in
  // an environment limited to develop is readable by jobs running on develop.
  it('reads the model credential from an environment, never from the repository secrets', () => {
    expect(review).toMatch(/^ {4}environment: independent-review$/m);
    expect(review).toContain(`claude_code_oauth_token: ${expression('secrets.CLAUDE_CODE_OAUTH_TOKEN')}`);
  });

  it('holds only what publishing a check and a comment needs', () => {
    expect(review).toMatch(/permissions:\n {6}contents: read\n {6}checks: write\n {6}pull-requests: write\n/);
    expect(queued).toMatch(/permissions:\n {6}actions: read\n {6}contents: read\n {6}pull-requests: read\n/);
    expect(queued).not.toMatch(/: write/);
    expect(reviewSource).toMatch(/^permissions: \{\}$/m);
    expect(queueSource).toMatch(/^permissions: \{\}$/m);
  });

  it('verifies the queue from the trusted base, with the history the back-merge needs', () => {
    expect(queued).toContain(`ref: ${expression('github.event.merge_group.base_ref')}`);
    expect(queued).toContain('persist-credentials: false');
    expect(queued).toContain('fetch-depth: 0');
    expect(queued).toMatch(/^ {8}run: node scripts\/independent-review-check\.mjs$/m);
  });
});
