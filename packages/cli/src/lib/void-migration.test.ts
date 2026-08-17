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
    expect(readFileSync(join(root, '.void/machine/activations.jsonl'), 'utf8')).toBe('a\n');
    expect(readFileSync(join(root, '.void/machine/runs/mis_1/events.jsonl'), 'utf8')).toBe('e\n');
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

  /**
   * Supersedes the earlier "leave the old path in place" rule.
   *
   * Leaving it meant the drift never resolved: every reader falls back, so
   * nothing ever pushed anyone to decide, and `update` reprinted "merge or
   * delete one" forever — asking for an arbitration while supplying none of the
   * facts needed to make it. Reported from a real consumer project.
   *
   * The target layout now wins and the legacy path goes away. Nothing is lost:
   * the destination file is kept and the legacy one is parked beside it. A
   * heuristic would be worse than parking — measured on the real park, the
   * legacy copy held MORE data in one journal (31 events against 1) and far
   * less in another (1190 against 17054), so neither side wins by rule.
   */
  it('moves the legacy half in, keeping the destination and parking the old copy', async () => {
    const root = project({
      '.void/activations.jsonl': 'old\n',
      '.void/machine/activations.jsonl': 'new\n',
    });

    const result = await migrateVoidLayout(root);

    expect(result.moved).toEqual(['activations.jsonl']);
    expect(result.conflicts).toEqual([]);
    expect(result.parked).toEqual(['activations.jsonl']);
    // The destination is untouched, and the old bytes are still readable.
    expect(readFileSync(join(root, '.void/machine/activations.jsonl'), 'utf8')).toBe('new\n');
    expect(readFileSync(join(root, '.void/machine/activations.jsonl.legacy'), 'utf8')).toBe('old\n');
    // The legacy path is gone, so the fallback stops firing and the drift stops
    // coming back.
    expect(existsSync(join(root, '.void/activations.jsonl'))).toBe(false);
  });

  it('merges a directory, moving what does not collide and parking what does', async () => {
    const root = project({
      '.void/runs/a/events.jsonl': 'legacy-a\n',
      '.void/runs/b/events.jsonl': 'legacy-b\n',
      '.void/machine/runs/b/events.jsonl': 'current-b\n',
    });

    const result = await migrateVoidLayout(root);

    expect(result.moved).toEqual(['runs']);
    expect(readFileSync(join(root, '.void/machine/runs/a/events.jsonl'), 'utf8')).toBe('legacy-a\n');
    expect(readFileSync(join(root, '.void/machine/runs/b/events.jsonl'), 'utf8')).toBe('current-b\n');
    expect(readFileSync(join(root, '.void/machine/runs/b/events.jsonl.legacy'), 'utf8')).toBe('legacy-b\n');
    expect(existsSync(join(root, '.void/runs'))).toBe(false);
  });

  /**
   * Derived state is restorable, observed state is not — they answer different
   * questions and land in different halves. Routing everything to `machine/`
   * would file the hook runner beside telemetry and make "can I delete this"
   * unanswerable again.
   */
  it('routes derived state to installed/ and observed state to machine/', async () => {
    const root = project({
      '.void/PHILOSOPHY.md': 'doctrine\n',
      '.void/hooks/_void-hook.mjs': 'runner\n',
      '.void/runs/a/events.jsonl': 'e\n',
    });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/installed/PHILOSOPHY.md'), 'utf8')).toBe('doctrine\n');
    expect(readFileSync(join(root, '.void/machine/runs/a/events.jsonl'), 'utf8')).toBe('e\n');
    expect(existsSync(join(root, '.void/PHILOSOPHY.md'))).toBe(false);

    // `hooks/` is derived AND committed, so it stays at the top: the top is what
    // git keeps, and `.claude/settings.json` — itself committed — resolves this
    // path by name. Under an ignored directory, a fresh clone would carry a
    // settings file pointing at a missing runner and fail on every tool call.
    expect(readFileSync(join(root, '.void/hooks/_void-hook.mjs'), 'utf8')).toBe('runner\n');
    expect(existsSync(join(root, '.void/installed/hooks'))).toBe(false);
  });

  /**
   * `state.json` named two things at once. The migration renames the snapshot;
   * the entry stays classified under its OLD name so a project that still has it
   * is not told to commit its own telemetry.
   */
  it('renames the status snapshot on the way over', async () => {
    const root = project({ '.void/state.json': '{"score":1}\n' });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/machine/status.json'), 'utf8')).toBe('{"score":1}\n');
    expect(existsSync(join(root, '.void/state.json'))).toBe(false);
  });

  it('migrates a project already on the previous machine directory', async () => {
    const root = project({ '.void/local/runs/a/events.jsonl': 'e\n' });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/machine/runs/a/events.jsonl'), 'utf8')).toBe('e\n');
    expect(existsSync(join(root, '.void/local'))).toBe(false);
  });

  it('leaves nothing to do on a second run after a merge', async () => {
    const root = project({
      '.void/activations.jsonl': 'old\n',
      '.void/machine/activations.jsonl': 'new\n',
    });
    await migrateVoidLayout(root);

    const second = await migrateVoidLayout(root);

    expect(second.moved).toEqual([]);
    expect(second.parked).toEqual([]);
  });

  it('never parks a copy over an existing parked one', async () => {
    const root = project({
      '.void/activations.jsonl': 'older\n',
      '.void/machine/activations.jsonl': 'new\n',
      '.void/machine/activations.jsonl.legacy': 'already-parked\n',
    });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/machine/activations.jsonl.legacy'), 'utf8')).toBe(
      'already-parked\n',
    );
    expect(existsSync(join(root, '.void/machine/activations.jsonl.legacy.2'))).toBe(true);
  });

  it('writes the ignore block, preserving the rules the project already had', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });
    writeFileSync(join(root, '.gitignore'), 'node_modules\ndist/\n');

    const result = await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(result.gitignoreTouched).toBe(true);
    expect(ignore).toContain('node_modules');
    expect(ignore).toContain('dist/');
    expect(ignore).toContain('.void/machine/');
  });

  it('replaces the improvised rule that started this, instead of stacking on it', async () => {
    // The block is marked, so a later run refreshes it in place. The hand-written
    // `.void/*` + `!` pair above it is the project's own text and is preserved —
    // reported, not silently rewritten.
    const root = project({ '.void/activations.jsonl': 'a\n' });
    writeFileSync(join(root, '.gitignore'), '.void/*\n!.void/PROJECT-DOCTRINE.md\n');

    await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(ignore).toContain('.void/machine/');
    expect(ignore.match(/void-harness:begin/g)).toHaveLength(1);
  });

  it('writes nothing in dry-run, while answering exactly what it would do', async () => {
    const root = project({ '.void/activations.jsonl': 'a\n' });

    const result = await migrateVoidLayout(root, true);

    expect(result.moved).toEqual(['activations.jsonl']);
    expect(result.gitignoreTouched).toBe(true);
    expect(existsSync(join(root, '.void/machine/activations.jsonl'))).toBe(false);
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });

  it('does nothing at all in a project the harness never touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-migration-bare-'));
    temporary.push(root);

    const result = await migrateVoidLayout(root);

    expect(result).toEqual({ moved: [], conflicts: [], parked: [], gitignoreTouched: false });
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });
});

describe('untrackDerived', () => {
  /** A git project whose install receipt claims exactly `owned`. */
  function gitProject(files: Record<string, string>, owned: readonly string[] = Object.keys(files)): string {
    const root = project({
      ...files,
      '.void/machine/receipts/install-v1.json': JSON.stringify({
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
      '.void/machine/receipts/install-v1.json': JSON.stringify({
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
      '.void/machine/activations.jsonl': 'new\n',
    });

    expect(planVoidMigration(root)).toEqual({ movable: ['runs'], conflicts: ['activations.jsonl'] });
  });
});
