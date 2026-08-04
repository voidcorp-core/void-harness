import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { migrateVoidLayout, ownedDerivedPaths, planVoidMigration, untrackDerived } from './void-migration.js';

const temporary: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'void-migration-'));
  temporary.push(root);
  mkdirSync(join(root, '.void'), { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, ...path.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrateVoidLayout', () => {
  it('moves observed state and leaves declared state exactly where it was', async () => {
    const root = project({
      '.void/activations.jsonl': 'a\n',
      '.void/runs/mis_1/events.jsonl': 'e\n',
      '.void/config.json': '{"packs":{}}',
      '.void/PROJECT-DOCTRINE.md': '# rules',
    });

    const result = await migrateVoidLayout(root);

    expect([...result.moved].sort()).toEqual(['activations.jsonl', 'runs']);
    expect(readFileSync(join(root, '.void/local/activations.jsonl'), 'utf8')).toBe('a\n');
    expect(readFileSync(join(root, '.void/local/runs/mis_1/events.jsonl'), 'utf8')).toBe('e\n');
    // The whole point: these two must still be where git and the hooks expect.
    expect(readFileSync(join(root, '.void/config.json'), 'utf8')).toBe('{"packs":{}}');
    expect(existsSync(join(root, '.void/PROJECT-DOCTRINE.md'))).toBe(true);
  });

  it('is idempotent — a second run has nothing left to do', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });
    await migrateVoidLayout(root);

    const second = await migrateVoidLayout(root);

    expect(second.moved).toEqual([]);
    expect(second.gitignoreTouched).toBe(false);
  });

  it('never overwrites a destination that already holds data', async () => {
    // Both halves populated means a half-finished migration or a concurrent
    // session. Losing the run journal a reconciliation is reading is worse than
    // leaving the old path in place, which every reader still falls back to.
    const root = project({
      '.void/activations.jsonl': 'old\n',
      '.void/local/activations.jsonl': 'new\n',
    });

    const result = await migrateVoidLayout(root);

    expect(result.conflicts).toEqual(['activations.jsonl']);
    expect(result.moved).toEqual([]);
    expect(readFileSync(join(root, '.void/local/activations.jsonl'), 'utf8')).toBe('new\n');
    expect(readFileSync(join(root, '.void/activations.jsonl'), 'utf8')).toBe('old\n');
  });

  it('writes the ignore block, preserving the rules the project already had', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });
    writeFileSync(join(root, '.gitignore'), 'node_modules\ndist/\n');

    const result = await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(result.gitignoreTouched).toBe(true);
    expect(ignore).toContain('node_modules');
    expect(ignore).toContain('dist/');
    expect(ignore).toContain('.void/local/');
  });

  it('replaces the improvised rule that started this, instead of stacking on it', async () => {
    // The block is marked, so a later run refreshes it in place. The hand-written
    // `.void/*` + `!` pair above it is the project's own text and is preserved —
    // reported, not silently rewritten.
    const root = project({ '.void/activations.jsonl': 'a\n' });
    writeFileSync(join(root, '.gitignore'), '.void/*\n!.void/PROJECT-DOCTRINE.md\n');

    await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(ignore).toContain('.void/local/');
    expect(ignore.match(/void-harness:begin/g)).toHaveLength(1);
  });

  it('writes nothing in dry-run, while answering exactly what it would do', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });

    const result = await migrateVoidLayout(root, true);

    expect(result.moved).toEqual(['activations.jsonl']);
    expect(result.gitignoreTouched).toBe(true);
    expect(existsSync(join(root, '.void/local/activations.jsonl'))).toBe(false);
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });

  it('does nothing at all in a project the harness never touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-migration-bare-'));
    temporary.push(root);

    const result = await migrateVoidLayout(root);

    expect(result).toEqual({ moved: [], conflicts: [], gitignoreTouched: false });
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });
});

describe('untrackDerived', () => {
  /** A git project whose install receipt claims exactly `owned`. */
  function gitProject(files: Record<string, string>, owned: readonly string[] = Object.keys(files)): string {
    const root = project({
      ...files,
      '.void/local/receipts/install-v1.json': JSON.stringify({
        schemaVersion: 1,
        version: '2.5.1',
        source: 'local',
        runtimes: ['claude'],
        files: owned.map((path) => ({ path, sha256: 'a'.repeat(64), mode: 0o644 })),
      }),
    });
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=c', 'commit', '-qm', 'in'], {
      cwd: root,
      stdio: 'ignore',
    });
    return root;
  }

  it('never touches a skill the project wrote itself', async () => {
    // The regression this exists for: `.claude/skills/` is shared, so ownership
    // must come from the receipt. A hand-written skill is not in it, and dropping
    // it from the index would be data loss by inference.
    const root = gitProject(
      {
        '.claude/skills/tdd/SKILL.md': '# harness',
        '.claude/skills/custom/SKILL.md': '# ours, by hand',
      },
      ['.claude/skills/tdd/SKILL.md'],
    );

    const result = await untrackDerived(root);
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });

    expect(result.untracked).toEqual(['.claude/skills/tdd/SKILL.md']);
    expect(tracked).toContain('.claude/skills/custom/SKILL.md');
    expect(existsSync(join(root, '.claude/skills/custom/SKILL.md'))).toBe(true);
  });

  it('knows what the harness owns on a fresh clone, where no receipt exists', async () => {
    // The interaction only both features together reveal: the receipt is
    // `observed`, therefore gitignored, therefore ABSENT after a clone. Sourcing
    // ownership from it would make `update` regenerate an ignore block with no
    // derived paths on exactly the checkout that needs them — un-ignoring the
    // whole vendored catalogue in one command. The manifest is committed.
    const root = project({
      '.claude/skills/tdd/SKILL.md': '# harness',
      '.claude/skills/custom/SKILL.md': '# ours',
      '.void/install-manifest.json': JSON.stringify({
        schemaVersion: 1,
        version: '2.5.1',
        files: [{ path: '.claude/skills/tdd/SKILL.md', sha256: 'a'.repeat(64) }],
      }),
    });
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=c', 'commit', '-qm', 'in'], {
      cwd: root,
      stdio: 'ignore',
    });

    const owned = await ownedDerivedPaths(root);
    const result = await untrackDerived(root);

    expect(owned).toEqual(new Set(['.claude/skills/tdd/SKILL.md']));
    expect(result.untracked).toEqual(['.claude/skills/tdd/SKILL.md']);
    // And the hand-written one is still nobody's business but the project's.
    expect(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }))
      .toContain('.claude/skills/custom/SKILL.md');
  });

  it('keeps the ignore block covering derived paths on a clone with no receipt', async () => {
    const root = project({
      '.void/install-manifest.json': JSON.stringify({
        schemaVersion: 1,
        version: '2.5.1',
        files: [{ path: '.claude/skills/tdd/SKILL.md', sha256: 'a'.repeat(64) }],
      }),
    });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.claude/skills/tdd/');
  });

  it('refuses to claim anything when neither manifest nor receipt is readable', async () => {
    const root = project({ '.claude/skills/custom/SKILL.md': '# ours' });
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });

    const result = await untrackDerived(root);

    expect(result.untracked).toEqual([]);
    expect(result.error).toMatch(/manifest or receipt/);
  });

  it('drops regenerated content from the index and leaves every byte on disk', async () => {
    const root = gitProject(
      {
        '.claude/skills/tdd/SKILL.md': '# tdd',
        '.agents/skills/tdd/SKILL.md': '# tdd',
        '.void/config.json': '{}',
      },
      ['.claude/skills/tdd/SKILL.md', '.agents/skills/tdd/SKILL.md', '.void/config.json'],
    );

    const result = await untrackDerived(root);
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });

    expect(result.untracked).toHaveLength(2);
    expect(tracked).toContain('.void/config.json');
    expect(tracked).not.toContain('.claude/skills');
    // The runtimes keep loading them until the next install.
    expect(existsSync(join(root, '.claude/skills/tdd/SKILL.md'))).toBe(true);
  });

  it('never drops what a fresh clone needs to work', async () => {
    // The runner is named from the tracked settings.json, and hooks.json IS the
    // Codex floor. Untracking either yields a clone that fails or a silent one.
    const root = gitProject({
      '.void/hooks/_void-hook.mjs': '// runner',
      '.codex/hooks.json': '{}',
      '.claude/settings.json': '{}',
    });

    const result = await untrackDerived(root);
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });

    expect(result.untracked).toEqual([]);
    expect(tracked).toContain('.void/hooks/_void-hook.mjs');
    expect(tracked).toContain('.codex/hooks.json');
    expect(tracked).toContain('.claude/settings.json');
  });

  it('answers without touching the index in dry-run', async () => {
    const root = gitProject({ '.claude/skills/tdd/SKILL.md': '# tdd' });

    const result = await untrackDerived(root, true);
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });

    expect(result.untracked).toEqual(['.claude/skills/tdd/SKILL.md']);
    expect(tracked).toContain('.claude/skills/tdd/SKILL.md');
  });

  it('reports rather than throws outside a git repository', async () => {
    const root = project({
      '.claude/skills/tdd/SKILL.md': '# tdd',
      '.void/local/receipts/install-v1.json': JSON.stringify({
        schemaVersion: 1,
        version: '2.5.1',
        source: 'local',
        runtimes: ['claude'],
        files: [{ path: '.claude/skills/tdd/SKILL.md', sha256: 'a'.repeat(64), mode: 0o644 }],
      }),
    });

    const result = await untrackDerived(root);

    expect(result.untracked).toEqual([]);
    expect(result.error).toMatch(/not a git repository/);
  });
});

describe('planVoidMigration', () => {
  it('separates what can move from what would collide', () => {
    const root = project({
      '.void/runs/mis_1/events.jsonl': 'e\n',
      '.void/activations.jsonl': 'old\n',
      '.void/local/activations.jsonl': 'new\n',
    });

    expect(planVoidMigration(root)).toEqual({ movable: ['runs'], conflicts: ['activations.jsonl'] });
  });
});
