/**
 * Tests for scripts/sync-agent-docs.sh — the CLAUDE.md <-> AGENTS.md parity gate.
 *
 * Structure mode (--files A B) compares section headings after normalizing away
 * the terminology variants (skill/tool, claude/codex). Staged mode (--staged)
 * is the pre-commit XOR check. Exit 0 in parity, 1 on drift.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(process.cwd(), 'scripts/sync-agent-docs.sh');
let dir: string;

function structure(claude: string, agents: string): number {
  const c = join(dir, 'C.md');
  const a = join(dir, 'A.md');
  writeFileSync(c, claude);
  writeFileSync(a, agents);
  return spawnSync('bash', [SCRIPT, '--files', c, a], { encoding: 'utf8' }).status ?? 1;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-sync-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sync-agent-docs.sh — structure mode', () => {
  it('passes when headings match after terminology normalization', () => {
    const claude = '# CLAUDE.md\n\n## Skill routing inside this repo\ntext\n## Meta-rules\nx\n';
    const agents = '# AGENTS.md\n\n## Tool routing inside this repo\nother text\n## Meta-rules\ny\n';
    expect(structure(claude, agents)).toBe(0);
  });

  it('fails when one doc has a section the other lacks', () => {
    const claude = '# CLAUDE.md\n\n## Autonomous mode\nx\n## Meta-rules\ny\n';
    const agents = '# AGENTS.md\n\n## Meta-rules\ny\n';
    expect(structure(claude, agents)).toBe(1);
  });

  it('passes when section content differs but headings match', () => {
    const claude = '# CLAUDE.md\n\n## Self-evolution principle\nclaude flavour\n';
    const agents = '# AGENTS.md\n\n## Self-evolution principle\ncodex flavour, different prose\n';
    expect(structure(claude, agents)).toBe(0);
  });
});

describe('sync-agent-docs.sh — staged mode', () => {
  function gitInit(): void {
    for (const args of [
      ['init', '-q'],
      ['config', 'user.email', 't@t.io'],
      ['config', 'user.name', 'T'],
    ]) {
      spawnSync('git', args, { cwd: dir });
    }
    writeFileSync(join(dir, 'CLAUDE.md'), '# CLAUDE.md\n## A\n');
    writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n## A\n');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  }
  function runStaged(): number {
    return spawnSync('bash', [SCRIPT, '--staged'], { cwd: dir, encoding: 'utf8' }).status ?? 1;
  }

  it('fails when only CLAUDE.md is staged', () => {
    gitInit();
    writeFileSync(join(dir, 'CLAUDE.md'), '# CLAUDE.md\n## A\n## B\n');
    spawnSync('git', ['add', 'CLAUDE.md'], { cwd: dir });
    expect(runStaged()).toBe(1);
  });

  it('passes when both sister docs are staged together', () => {
    gitInit();
    writeFileSync(join(dir, 'CLAUDE.md'), '# CLAUDE.md\n## A\n## B\n');
    writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n## A\n## B\n');
    spawnSync('git', ['add', 'CLAUDE.md', 'AGENTS.md'], { cwd: dir });
    expect(runStaged()).toBe(0);
  });

  it('passes when neither sister doc is staged', () => {
    gitInit();
    writeFileSync(join(dir, 'other.txt'), 'x\n');
    spawnSync('git', ['add', 'other.txt'], { cwd: dir });
    expect(runStaged()).toBe(0);
  });
});
