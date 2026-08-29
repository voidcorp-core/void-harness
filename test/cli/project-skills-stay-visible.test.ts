/**
 * A skill the project wrote is work, not a regenerable file, and losing it lands
 * at the first clone -- long before anyone thinks to run `doctor`.
 *
 * The block used to ignore `.claude/skills/*` wholesale and leave the project to
 * re-include each of its own skills by hand. This asserts the replacement end to
 * end, through a real init and a real clone: what the harness ships is hidden,
 * what the project wrote is committed and survives.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../../packages/cli/src/commands/init.js';

let dir: string;
let cwd: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-visible-'));
  cwd = process.cwd();
  process.chdir(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

const ignored = (path: string): boolean =>
  spawnSync('git', ['check-ignore', '-q', path], { cwd: dir }).status === 0;

function writeSkill(path: string): void {
  mkdirSync(join(dir, ...path.split('/')), { recursive: true });
  writeFileSync(join(dir, ...path.split('/'), 'SKILL.md'), '---\nname: mine\n---\n');
}

describe('a project keeps its own skills visible to git', () => {
  it('never ignores a skill the project wrote, with no line to add by hand', async () => {
    writeSkill('.claude/skills/ma-skill');
    await init(['--runtime', 'claude', '--no-interactive']);

    expect(ignored('.claude/skills/ma-skill/SKILL.md')).toBe(false);
  });

  it('still hides the skills the harness ships, so the derived content decision holds', async () => {
    await init(['--runtime', 'claude', '--no-interactive']);

    expect(ignored('.claude/skills/void-tdd/SKILL.md')).toBe(true);
  });

  it('carries the project skill through a real clone, which is where the loss landed', async () => {
    writeSkill('.claude/skills/ma-skill');
    await init(['--runtime', 'claude', '--no-interactive']);
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '-qm', 'install'], { cwd: dir });

    const clone = mkdtempSync(join(tmpdir(), 'void-clone-'));
    spawnSync('git', ['clone', '-q', dir, clone]);
    try {
      expect(existsSync(join(clone, '.claude', 'skills', 'ma-skill', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(clone, '.claude', 'skills', 'void-tdd', 'SKILL.md'))).toBe(false);
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  });

  it('never ignores an agent the project wrote itself', async () => {
    mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'agents', 'mon-agent.md'), '# mine\n');
    await init(['--runtime', 'claude', '--no-interactive']);

    expect(ignored('.claude/agents/mon-agent.md')).toBe(false);
    expect(ignored('.claude/agents/doctrine-critic.md')).toBe(true);
  });
});
