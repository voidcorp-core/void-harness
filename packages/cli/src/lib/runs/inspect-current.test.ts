import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProjectRoots } from '../project-roots.js';
import { inspectCurrentMission } from './inspect-current.js';
import { computeProjectState } from './project-state.js';
import { createMission } from './store.js';

// The run belongs to the repository, not to the tree (decision of 2026-09-02):
// its journal lives under the installation root, which from a linked worktree
// is the main checkout. What is hashed to bind the evidence is the tree the
// command ran in. Read from one root, the inspection either found no journal
// in the worktree or hashed a tree nobody was working on.

const ID = 'mis_0123456789abcdef0123456789abcdef';
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function directory(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function repository(): string {
  const root = directory('void-inspect-main-');
  git(root, 'init', '--quiet');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git(root, 'add', 'README.md');
  git(
    root,
    '-c', 'user.name=Void Test',
    '-c', 'user.email=void@example.test',
    'commit', '--quiet', '-m', 'test: seed',
  );
  return root;
}

function linkedWorktree(main: string): string {
  const path = join(directory('void-inspect-linked-'), 'DEV-000');
  git(main, 'worktree', 'add', '--quiet', path, '-b', 'worker/DEV-000');
  return path;
}

/** A mission started in `root`, whose journal `init`'s exclude block hides from git. */
async function missionIn(root: string): Promise<void> {
  await createMission(root, { missionId: ID, title: 'Root resolution', mode: 'team' });
}

function kinds(inspected: Awaited<ReturnType<typeof inspectCurrentMission>>['inspected']): string[] {
  return inspected.stream.events.map((event) => event.kind);
}

describe('inspectCurrentMission from a linked worktree', () => {
  it('reads the journal of the main checkout and writes nothing in the worktree', async () => {
    const main = repository();
    const linked = linkedWorktree(main);
    await missionIn(main);
    expect(existsSync(join(linked, '.void'))).toBe(false);

    const { inspected } = await inspectCurrentMission(resolveProjectRoots(linked), ID, []);

    expect(kinds(inspected)).toContain('mission.started');
    expect(existsSync(join(main, '.void', 'machine', 'runs', ID, 'events.jsonl'))).toBe(true);
    expect(existsSync(join(linked, '.void', 'machine'))).toBe(false);
  });

  it('hashes the tree it ran in, never the main checkout', async () => {
    const main = repository();
    const linked = linkedWorktree(main);
    await missionIn(main);
    writeFileSync(join(linked, 'worker-only.ts'), 'export const changed = true;\n');

    const { project } = await inspectCurrentMission(resolveProjectRoots(linked), ID, []);

    expect(project.diffHash).toBe((await computeProjectState(linked)).diffHash);
    expect(project.diffHash).not.toBe((await computeProjectState(main)).diffHash);
  });

  it('looks for a mission started nowhere in the main checkout, and names that path', async () => {
    const main = repository();
    const linked = linkedWorktree(main);

    await expect(inspectCurrentMission(resolveProjectRoots(linked), ID, [])).rejects.toThrow(
      join(realpathSync(main), '.void', 'machine', 'runs', ID),
    );
  });
});

describe('inspectCurrentMission in the main checkout', () => {
  it('reads the journal and hashes the tree from the one root there is', async () => {
    const main = repository();
    await missionIn(main);
    const roots = resolveProjectRoots(main);
    expect(roots.installRoot).toBe(roots.workRoot);

    const { inspected, project } = await inspectCurrentMission(roots, ID, []);

    expect(kinds(inspected)).toContain('mission.started');
    expect(project.diffHash).toBe((await computeProjectState(main)).diffHash);
  });
});
