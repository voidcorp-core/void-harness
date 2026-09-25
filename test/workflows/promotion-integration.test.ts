import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(new URL('../../.github/workflows/promotion.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('          commit_count=');
const end = workflow.indexOf('          body=$(printf', start);
const audit = workflow.slice(start, end).replace(/^ {10}/gm, '');

function history(root: string, direct = false) {
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_EMAIL: 'test@example.test' },
  }).trim();
  git('init', '--quiet', '--initial-branch=develop');
  git('commit', '--quiet', '--allow-empty', '-m', 'seed');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  if (direct) git('commit', '--quiet', '--allow-empty', '-m', 'direct');
  const directOid = git('rev-parse', 'HEAD');
  git('switch', '--quiet', '-c', 'outer');
  git('commit', '--quiet', '--allow-empty', '-m', 'outer');
  git('switch', '--quiet', '-c', 'inner');
  git('commit', '--quiet', '--allow-empty', '-m', 'inner');
  const inner = git('rev-parse', 'HEAD');
  git('switch', '--quiet', 'outer');
  git('merge', '--quiet', '--no-ff', 'inner', '-m', 'merge inner');
  git('switch', '--quiet', 'develop');
  git('merge', '--quiet', '--no-ff', 'outer', '-m', 'merge outer');
  const integration = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
  const commits = git('rev-list', 'origin/main..origin/develop').split('\n');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash
set -eu
query=''
for arg in "$@"; do
  case "$arg" in query=*) query=\${arg#query=};; esac
done
count_file="$FIXTURES/query-count"
count=0
if [ -f "$count_file" ]; then count=$(cat "$count_file"); fi
printf '%s\n' "$((count + 1))" > "$count_file"
printf '%s\n' "$query" > "$FIXTURES/last-query"
if [ "\${FAIL_ALWAYS:-0}" = 1 ] ||
  { [ "\${FAIL_ONCE:-0}" = 1 ] && [ "$count" = 0 ]; }; then
  printf '{"errors":[{"message":"transient GraphQL failure"}]}\n'
  exit 1
fi
mapfile -t oids < <(printf '%s\n' "$query" |
  grep -oE 'object\\(oid:"[0-9a-f]+"' |
  sed -E 's/.*oid:"([0-9a-f]+)".*/\\1/')
printf '{"data":{"repository":{'
first=true
for index in "\${!oids[@]}"; do
  oid="\${oids[$index]}"
  if [ "$first" = false ]; then printf ','; fi
  first=false
  printf '"c%s":' "$index"
  jq -c '.data.repository.object' "$FIXTURES/$oid.json"
done
printf '}}}\n'
`, { mode: 0o755 });
  const seed = git('rev-parse', 'refs/remotes/origin/main');
  return { root, bin, commits, inner, integration, directOid, seed };
}

let baselineRoot = '';
let baseline: ReturnType<typeof history>;
let directBaseline: ReturnType<typeof history>;
const scenarioRoots: string[] = [];

beforeAll(() => {
  baselineRoot = mkdtempSync(join(tmpdir(), 'void-promotion-baselines-'));
  const regularRoot = join(baselineRoot, 'regular');
  const directRoot = join(baselineRoot, 'direct');
  mkdirSync(regularRoot);
  mkdirSync(directRoot);
  baseline = history(regularRoot);
  directBaseline = history(directRoot, true);
});

afterAll(() => {
  if (baselineRoot) rmSync(baselineRoot, { recursive: true, force: true });
});

afterEach(() => {
  for (const root of scenarioRoots) rmSync(root, { recursive: true, force: true });
  scenarioRoots.length = 0;
});

function copyHistory(direct = false) {
  const source = direct ? directBaseline : baseline;
  const root = mkdtempSync(join(tmpdir(), 'void-promotion-'));
  // Register before copying so a failed copy is cleaned by afterEach too.
  scenarioRoots.push(root);
  // Full copies preserve isolation; no shared Git objects, refs or query counters.
  cpSync(source.root, root, { recursive: true, verbatimSymlinks: true });
  return { ...source, root, bin: join(root, 'bin') };
}

function runAudit(options: {
  direct?: boolean;
  mismatched?: boolean;
  paginated?: boolean;
  failOnce?: boolean;
  failAlways?: boolean;
  /** The review App id promotion.yml reads, `4242` unless given. */
  reviewAppId?: string;
  /** Merge facts of the integration PR, over a hand merge by folpe. */
  pull?: (fixture: ReturnType<typeof copyHistory>) => Record<string, unknown>;
} = {}) {
  const fixture = copyHistory(options.direct);
  for (const oid of fixture.commits) {
    const pr = {
      number: 331, baseRefName: 'develop', headRefName: 'outer', isCrossRepository: false,
      mergedAt: '2026-09-05T10:00:00Z', mergedBy: { login: 'folpe' },
      mergeCommit: { oid: options.mismatched ? fixture.inner : fixture.integration },
      headRepository: { nameWithOwner: 'voidcorp-core/void-harness' },
      headRepositoryOwner: { login: 'voidcorp-core' },
      timelineItems: { nodes: [], pageInfo: { hasNextPage: false } },
      ...options.pull?.(fixture),
    };
    // GitHub reports the inner PR for its original commit, not the later outer PR.
    const nodes = oid === fixture.inner && !options.direct && !options.mismatched
      ? [{ ...pr, number: 332, baseRefName: 'outer' }] : [pr];
    writeFileSync(join(fixture.root, `${oid}.json`), JSON.stringify({ data: { repository: {
      object: { oid, associatedPullRequests: {
        nodes, pageInfo: { hasNextPage: options.paginated ?? false },
      } },
    } } }));
  }
  const result = spawnSync('bash', ['-c', `set -euo pipefail\n${audit}`], {
    cwd: fixture.root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH}`, FIXTURES: fixture.root,
      FAIL_ONCE: options.failOnce ? '1' : '0', FAIL_ALWAYS: options.failAlways ? '1' : '0',
      GITHUB_WORKSPACE: ROOT,
      EXPECTED_OWNER: 'voidcorp-core', EXPECTED_NAME: 'void-harness',
      EXPECTED_REPOSITORY: 'voidcorp-core/void-harness', EXPECTED_HUMAN: 'folpe',
      REVIEW_APP_ID: options.reviewAppId ?? '4242',
      MAX_PROMOTION_COMMITS: '500', PROMOTION_BATCH_SIZE: '40',
      PROMOTION_API_RETRIES: '3', PROMOTION_RETRY_DELAY_SECONDS: '0' },
  });
  return { ...result, ...fixture };
}

describe('promotion integration authority', () => {
  it('accounts for every nested commit through its actual integration PR', () => {
    const result = runAudit();
    expect(result.status, result.stderr).toBe(0);
    for (const oid of result.commits) expect(result.stdout).toContain(oid.slice(0, 12));
  });

  it('does not launder a direct commit through a later authorized integration', () => {
    const result = runAudit({ direct: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexplained commit');
  });

  it.each([{ mismatched: true }, { paginated: true }])('refuses incomplete or mismatched authority %j', (options) => {
    expect(runAudit(options).status).not.toBe(0);
  });

  it('audits the complete fixture through one GraphQL batch', () => {
    const result = runAudit();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(result.root, 'query-count'), 'utf8').trim()).toBe('1');
  });

  it('retries a transient API failure without changing the audit result', () => {
    const result = runAudit({ failOnce: true });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(result.root, 'query-count'), 'utf8').trim()).toBe('2');
  });

  // Any job can post a check named independent-review; only the review App's
  // counts, so the query filters the head's suites by its id.
  it('reads the review check from the review App alone', () => {
    const result = runAudit();
    expect(result.status).toBe(0);
    expect(readFileSync(join(result.root, 'last-query'), 'utf8')).toContain('checkSuites(first:5,filterBy:{appId:4242})');
  });

  it('refuses the GitHub Actions app as the review App', () => {
    const result = runAudit({ reviewAppId: '15368' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('the review App id is the GitHub Actions app.');
    expect(existsSync(join(result.root, 'query-count'))).toBe(false);
  });

  it.each(['', '0', '15368 ', 'abc'])('refuses to audit without a review App id (%j)', (reviewAppId) => {
    const result = runAudit({ reviewAppId });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('no review App id to hold the independent-review check to.');
    expect(existsSync(join(result.root, 'query-count'))).toBe(false);
  });

  it('reports a persistent API failure separately from an unexplained commit', () => {
    const result = runAudit({ failAlways: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('GitHub GraphQL API error for batch');
    expect(result.stderr).not.toContain('unexplained commit');
  });

  describe('automatic merges into develop', () => {
    type Fixture = ReturnType<typeof copyHistory>;
    const event = (typename: string) =>
      ({ __typename: typename, actor: { login: 'folpe' }, createdAt: '2026-09-23T10:00:00Z' });
    const verdict = (oid: string, state: string | null) =>
      ({
        nodes: [{
          commit: {
            oid,
            checkSuites: state === null
              ? { totalCount: 0, nodes: [] }
              : {
                totalCount: 1,
                nodes: [{ checkRuns: { totalCount: 1, nodes: [{ status: 'COMPLETED', conclusion: state, completedAt: '2026-09-24T10:00:00Z' }] } }],
              },
          },
        }],
      });

    function merged(typename: string, state: string | null, head = 'e'.repeat(40)) {
      return {
        headRefOid: head,
        mergedBy: { login: 'github-merge-queue' },
        timelineItems: { nodes: [event(typename)], pageInfo: { hasNextPage: false } },
        commits: verdict(head, state),
      };
    }

    const backMerge = (head: (fixture: Fixture) => string) => (fixture: Fixture) => ({
      ...merged('AutoMergeEnabledEvent', null, head(fixture)),
      headRefName: 'chore/back-merge-main',
      mergedBy: { login: 'voidcorp-release' },
    });

    it.each(['AutoMergeEnabledEvent', 'AddedToMergeQueueEvent'])(
      'accepts a %s merge whose head carries a success verdict',
      (typename) => {
        const result = runAudit({ pull: () => merged(typename, 'SUCCESS') });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('authority: `review-verdict`');
      },
    );

    it.each([null, 'FAILURE', 'PENDING'])(
      'refuses an automatic merge whose verdict is %s',
      (state) => {
        const result = runAudit({ pull: () => merged('AutoMergeEnabledEvent', state) });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('merged automatically');
      },
    );

    it('accepts the back-merge by its construction, without a verdict', () => {
      const result = runAudit({ pull: backMerge((fixture) => fixture.seed) });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('authority: `back-merge`');
    });

    it('refuses a back-merge its construction does not explain and no verdict covers', () => {
      const result = runAudit({ pull: backMerge((fixture) => fixture.inner) });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('not the back-merge');
    });
  });
});
