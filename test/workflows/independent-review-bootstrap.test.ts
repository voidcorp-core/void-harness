import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REVIEW_PUBLIC_KEY_PATH } from '../../scripts/independent-review-check.mjs';

// The bootstrap window of the required `independent-review` check. The job
// checks out the base branch and decides there: with no review key committed
// on the base, nobody can sign a verdict yet, so the check passes and says it
// is not configured; with the key committed, the base's script judges, strict.
// The step is extracted from the workflow and run by bash against a real git
// repository standing in for the base checkout.
const workflow = readFileSync(
  new URL('../../.github/workflows/void-enforce.yml', import.meta.url),
  'utf8',
);
const STEP_NAME = '      - name: Verify the review verdict on every head SHA about to merge\n';

function reviewStep(): { readonly run: string; readonly keyPath: string } {
  const start = workflow.indexOf(STEP_NAME);
  const step = workflow.slice(start + STEP_NAME.length);
  const keyPath = /^ {10}REVIEW_PUBLIC_KEY_PATH: (.+)$/m.exec(step)?.[1] ?? '';
  const body = step.slice(step.indexOf('        run: |\n') + '        run: |\n'.length);
  const lines = body.split('\n');
  const end = lines.findIndex((line) => line !== '' && !line.startsWith('          '));
  const run = (end < 0 ? lines : lines.slice(0, end)).map((line) => line.slice(10)).join('\n');
  return { run, keyPath };
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Base {
  /** Commit the review public key on the base. */
  readonly key?: boolean;
  /** The verifier committed on the base: its exit code, or absent. */
  readonly verifierExit?: number;
  /** The checkout is not a git repository at all. */
  readonly notGit?: boolean;
}

function checkout(base: Base): string {
  const root = mkdtempSync(join(tmpdir(), 'void-review-bootstrap-'));
  roots.push(root);
  if (base.verifierExit !== undefined) {
    mkdirSync(join(root, 'scripts'));
    writeFileSync(
      join(root, 'scripts', 'independent-review-check.mjs'),
      `process.stdout.write('verifier ran\\n');\nprocess.exitCode = ${base.verifierExit};\n`,
    );
  }
  if (base.key === true) {
    mkdirSync(join(root, '.github'));
    writeFileSync(join(root, REVIEW_PUBLIC_KEY_PATH), 'MCowBQYDK2VwAyEA\n');
  }
  if (base.notGit === true) return root;
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_EMAIL: 'test@example.test' },
  });
  git('init', '--quiet', '--initial-branch=develop');
  git('add', '--all');
  git('commit', '--quiet', '--allow-empty', '-m', 'base');
  return root;
}

function runStep(root: string) {
  const { run, keyPath } = reviewStep();
  const summary = join(root, 'summary.md');
  writeFileSync(summary, '');
  const result = spawnSync('bash', ['-e', '-c', run], {
    cwd: root, encoding: 'utf8',
    env: { PATH: process.env.PATH, GIT_CEILING_DIRECTORIES: tmpdir(),
      GITHUB_STEP_SUMMARY: summary, REVIEW_PUBLIC_KEY_PATH: keyPath },
  });
  return { ...result, summary: readFileSync(summary, 'utf8') };
}

describe('independent-review bootstrap window', () => {
  it('names the key path the verifier reads', () => {
    expect(reviewStep().keyPath).toBe(REVIEW_PUBLIC_KEY_PATH);
  });

  it('passes, saying it is not configured, when the base holds no review key', () => {
    // Develop today: neither the key nor the verifier exists on the base.
    const result = runStep(checkout({}));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::notice::');
    expect(result.stdout).toContain('not configured');
    expect(result.summary).toContain('not configured');
    expect(result.summary).toContain(REVIEW_PUBLIC_KEY_PATH);
  });

  it('passes without running the verifier once it is on the base but the key is not', () => {
    const result = runStep(checkout({ verifierExit: 1 }));
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('verifier ran');
    expect(result.summary).toContain('not configured');
  });

  it('runs the base verifier and fails with it once the key is on the base', () => {
    const result = runStep(checkout({ key: true, verifierExit: 1 }));
    expect(result.stdout).toContain('verifier ran');
    expect(result.status).not.toBe(0);
    expect(result.summary).not.toContain('not configured');
  });

  it('passes only through the verifier once the key is on the base', () => {
    const result = runStep(checkout({ key: true, verifierExit: 0 }));
    expect(result.stdout).toContain('verifier ran');
    expect(result.status).toBe(0);
    expect(result.summary).not.toContain('not configured');
  });

  it('fails when the key is on the base but the verifier is not', () => {
    const result = runStep(checkout({ key: true }));
    expect(result.status).not.toBe(0);
  });

  it('fails rather than read a git error as an absent key', () => {
    const result = runStep(checkout({ key: true, verifierExit: 0, notGit: true }));
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('verifier ran');
    expect(result.summary).not.toContain('not configured');
  });
});
