import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { captureMissionReviewSubject } from './mission.js';

function git(root: string, args: readonly string[]) {
  return execFileSync('git', [...args], { cwd: root, encoding: 'utf8' }).trim();
}
it('reviews an exact committed HEAD and refuses mutable code as its subject', async () => {
  const root = await mkdtemp(join(tmpdir(), 'void-bounded-subject-'));
  git(root, ['init', '--quiet']);
  await writeFile(join(root, 'auth.ts'), 'export const authorized = false;\n');
  git(root, ['add', 'auth.ts']);
  const commit = () => git(root, ['-c', 'user.name=Void Test', '-c', 'user.email=test@example.test',
    'commit', '--quiet', '-m', 'test: seed subject']);
  commit();
  const base = git(root, ['rev-parse', 'HEAD']);
  await writeFile(join(root, 'auth.ts'), 'export const authorized = true;\n');
  git(root, ['add', 'auth.ts']);
  await expect(captureMissionReviewSubject(root, base, true)).rejects.toThrow('MISSION_REVIEW_UNCOMMITTED');
  commit();
  const first = await captureMissionReviewSubject(root, base, true);
  expect(first.reviewedCommit).toBe(git(root, ['rev-parse', 'HEAD']));
  git(root, ['-c', 'user.name=Void Test', '-c', 'user.email=test@example.test',
    'commit', '--allow-empty', '--quiet', '-m', 'test: distinct committed subject']);
  const second = await captureMissionReviewSubject(root, base, true);
  expect(first.diff).toBe(second.diff);
  expect(first.hash).not.toBe(second.hash);
});
