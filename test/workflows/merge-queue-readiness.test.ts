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
  // `validate` and the three `install conformance` jobs live in ci.yml;
  // `enforce` and `independent-review` live in void-enforce.yml.
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

describe('independent-review job', () => {
  const review = job(read('.github/workflows/void-enforce.yml'), 'independent-review');

  it('runs on develop pull requests and on merge groups only', () => {
    expect(review).toContain(
      `if: ${expression(
        "github.event_name == 'merge_group' || "
          + "(github.event_name == 'pull_request' && github.base_ref == 'develop')",
      )}`,
    );
  });

  it('holds read-only permissions on contents, pull requests and statuses', () => {
    expect(review).toMatch(
      /permissions:\n {6}contents: read\n {6}pull-requests: read\n {6}statuses: read\n/,
    );
    expect(review).not.toMatch(/: write/);
  });

  it('runs the verifier from the trusted base branch, not from the change under review', () => {
    expect(review).toContain(
      `ref: ${expression(
        'github.event.pull_request.base.ref || github.event.merge_group.base_ref',
      )}`,
    );
    expect(review).toContain('persist-credentials: false');
    expect(review).toMatch(/^ {10}node scripts\/independent-review-check\.mjs$/m);
  });

  it('checks out the history the back-merge commits are verified against', () => {
    // The script proves the back-merge's commits in git: ancestry against main
    // and develop, and its tree against a recomputed merge.
    expect(review).toContain('fetch-depth: 0');
  });
});
