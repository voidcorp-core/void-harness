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
  // `validate` and the three `install conformance` jobs live in ci.yml and
  // `enforce` in void-enforce.yml; `independent-review` follows ci, below.
  it.each(['ci.yml', 'void-enforce.yml'])('%s answers merge groups on develop', (name) => {
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
  const verify = job(queueSource, 'verify');
  const APP_TOKEN =
    /uses: actions\/create-github-app-token@[0-9a-f]{40} # v3\.2\.0\n {8}with:\n {10}client-id: \$\{\{ vars\.REVIEW_APP_CLIENT_ID \}\}\n {10}private-key: \$\{\{ secrets\.REVIEW_APP_PRIVATE_KEY \}\}\n {10}permission-checks: write\n/;

  // The required check is posted by the review App, never reported by a job:
  // a job skipped under a required name reports success, so no job bears it.
  it('lets no job bear the required name', () => {
    for (const name of ['ci.yml', 'void-enforce.yml', 'independent-review.yml', 'independent-review-queue.yml']) {
      expect(read(`.github/workflows/${name}`)).not.toMatch(/\n {2}independent-review:\n/);
    }
  });

  // The workflow, the scripts and the instructions come from the default
  // branch, and the head is data in a subdirectory: nothing the pull request
  // controls runs with the model credential or the App key.
  it('reviews from the default branch, with the head checked out as data only', () => {
    expect(triggers(reviewSource)).toMatch(/^ {2}pull_request_target:\n {4}branches: \[develop\]$/m);
    expect(review).toContain(`ref: ${expression('github.event.pull_request.head.sha')}`);
    expect(review).toContain('path: pr-head');
    expect(review).not.toMatch(/pnpm|npm (?:ci|install)|node pr-head/);
    expect(review).toContain('--allowedTools Read,Grep,Glob');
    expect(review).toContain('--add-dir pr-head');
    expect(review).toContain('--max-turns 120');
    expect(review).toMatch(/uses: anthropics\/claude-code-action@[0-9a-f]{40} /);
  });

  it('skips drafts, which a later ready event reviews', () => {
    expect(review).toContain(`if: ${expression('github.event.pull_request.draft == false')}`);
  });

  // A repository secret is readable by any workflow pushed to any branch; one in
  // an environment limited to main is readable by jobs running from main.
  it('reads the model credential and the App key from an environment alone', () => {
    expect(review).toMatch(/^ {4}environment: independent-review$/m);
    expect(verify).toMatch(/^ {4}environment: independent-review$/m);
    expect(review).toContain(`claude_code_oauth_token: ${expression('secrets.CLAUDE_CODE_OAUTH_TOKEN')}`);
  });

  // The job token only comments: the check is written with the App's token,
  // itself narrowed to checks, so branch protection can pin the App.
  it('writes the check as the review App, and nothing else as it', () => {
    expect(review).toMatch(APP_TOKEN);
    expect(verify).toMatch(APP_TOKEN);
    const checksToken = `CHECKS_TOKEN: ${expression('steps.app.outputs.token')}`;
    expect(verify).toContain(checksToken);
    // No App token is alive while the model reads the head.
    const [opening = '', rest = ''] = review.split('      - name: Review\n');
    expect(opening.split(checksToken)).toHaveLength(2);
    expect(opening).toContain('skip-token-revoke: true');
    expect(opening).toMatch(/if: always\(\) && steps\.app\.outputs\.token != ''\n.*\n {10}GH_TOKEN: \$\{\{ steps\.app\.outputs\.token \}\}\n {8}run: gh api --method DELETE installation\/token\n/);
    expect(rest).not.toContain(checksToken);
    expect(rest).toMatch(APP_TOKEN);
    expect(rest).toContain(`CHECKS_TOKEN: ${expression('steps.app-finish.outputs.token')}`);
    expect(verify).toContain(`REVIEW_APP_ID: ${expression('vars.REVIEW_APP_ID')}`);
  });

  it('holds only what publishing a comment and reading the queue need', () => {
    expect(review).toMatch(/permissions:\n {6}contents: read\n {6}pull-requests: write\n/);
    expect(verify).toMatch(/permissions:\n {6}contents: read\n {6}checks: read\n {6}pull-requests: read\n/);
    expect(`${review}${verify}`).not.toMatch(/^ {6}checks: write/m);
    expect(verify).not.toMatch(/^ {6}[a-z-]+: write/m);
    expect(reviewSource).toMatch(/^permissions: \{\}$/m);
    expect(queueSource).toMatch(/^permissions: \{\}$/m);
  });

  // A merge_group workflow runs from the group commit, which the pull request
  // edits; workflow_run of ci runs from the default branch.
  it('verifies the queue from the default branch, on each merge group ci starts', () => {
    expect(triggers(queueSource)).toMatch(/^ {2}workflow_run:\n {4}workflows: \[ci\]\n {4}types: \[requested\]$/m);
    expect(triggers(queueSource)).not.toMatch(/merge_group:|pull_request/);
    expect(verify).toContain(`if: ${expression("github.event.workflow_run.event == 'merge_group'")}`);
    expect(verify).not.toMatch(/\n {10}ref:/);
    expect(verify).toContain('persist-credentials: false');
    expect(verify).toContain('fetch-depth: 0');
    expect(verify).toMatch(/^ {8}run: node scripts\/independent-review-check\.mjs$/m);
  });
});
