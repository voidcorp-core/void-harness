import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/promotion.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('          commit_count=');
const end = workflow.indexOf('          body=$(printf', start);
const audit = workflow.slice(start, end).replace(/^ {10}/gm, '');

function history(direct = false) {
  const root = mkdtempSync(join(tmpdir(), 'void-promotion-'));
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
for arg in "$@"; do
  case "$arg" in oid=*) cat "$FIXTURES/\${arg#oid=}.json"; exit 0;; esac
done
exit 1
`, { mode: 0o755 });
  return { root, bin, commits, inner, integration, directOid };
}

function runAudit(options: { direct?: boolean; mismatched?: boolean; paginated?: boolean } = {}) {
  const fixture = history(options.direct);
  for (const oid of fixture.commits) {
    const pr = {
      number: 331, baseRefName: 'develop', headRefName: 'outer', isCrossRepository: false,
      mergedAt: '2026-09-05T10:00:00Z', mergedBy: { login: 'folpe' },
      mergeCommit: { oid: options.mismatched ? fixture.inner : fixture.integration },
      headRepository: { nameWithOwner: 'voidcorp-core/void-harness' },
      headRepositoryOwner: { login: 'voidcorp-core' },
      timelineItems: { nodes: [], pageInfo: { hasNextPage: false } },
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
      EXPECTED_OWNER: 'voidcorp-core', EXPECTED_NAME: 'void-harness',
      EXPECTED_REPOSITORY: 'voidcorp-core/void-harness', EXPECTED_HUMAN: 'folpe',
      MAX_PROMOTION_COMMITS: '500' },
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
});
