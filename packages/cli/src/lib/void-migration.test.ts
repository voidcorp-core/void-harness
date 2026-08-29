import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gitignoreBlock } from '@voidcorp/hook-runner';
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
      '.void/cache/x.json': 'a\n',
      '.void/runs/mis_1/events.jsonl': 'e\n',
      '.void/config.json': '{"packs":{}}',
      '.void/PROJECT-DOCTRINE.md': '# rules',
    });

    const result = await migrateVoidLayout(root);

    expect([...result.moved].sort()).toEqual(['cache', 'runs']);
    expect(readFileSync(join(root, '.void/machine/cache/x.json'), 'utf8')).toBe('a\n');
    expect(readFileSync(join(root, '.void/machine/runs/mis_1/events.jsonl'), 'utf8')).toBe('e\n');
    // The whole point: these two must still be where git and the hooks expect.
    expect(readFileSync(join(root, '.void/config.json'), 'utf8')).toBe('{"packs":{}}');
    expect(existsSync(join(root, '.void/PROJECT-DOCTRINE.md'))).toBe(true);
  });

  it('is idempotent — a second run has nothing left to do', async () => {
    const root = project({ '.void/cache/x.json': 'a\n' });
    await migrateVoidLayout(root);

    const second = await migrateVoidLayout(root);

    expect(second.moved).toEqual([]);
    expect(second.gitignoreBlockRemoved).toBe(false);
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
      '.void/cache/x.json': 'old\n',
      '.void/machine/cache/x.json': 'new\n',
    });

    const result = await migrateVoidLayout(root);

    expect(result.moved).toEqual(['cache']);
    expect(result.conflicts).toEqual([]);
    expect(result.parked).toEqual(['cache']);
    // The destination is untouched, and the old bytes are still readable.
    expect(readFileSync(join(root, '.void/machine/cache/x.json'), 'utf8')).toBe('new\n');
    expect(readFileSync(join(root, '.void/machine/cache/x.json.legacy'), 'utf8')).toBe('old\n');
    // The legacy path is gone, so the fallback stops firing and the drift stops
    // coming back.
    expect(existsSync(join(root, '.void/cache/x.json'))).toBe(false);
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

    expect(readFileSync(join(root, '.void/machine/runs/a/events.jsonl'), 'utf8')).toBe('e\n');

    // Restorable content is DROPPED from the old location, not moved: the
    // install that runs immediately after fills `installed/`, and it is the only
    // thing that may write there. Moving a file in by hand hands the install a
    // managed path it cannot prove it wrote, which it then refuses to overwrite.
    expect(existsSync(join(root, '.void/PHILOSOPHY.md'))).toBe(false);
    expect(existsSync(join(root, '.void/installed/PHILOSOPHY.md'))).toBe(false);

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

  /**
   * Measured on a clone of a real project: the receipt held 168 owned files and
   * NONE of them was `PHILOSOPHY.md`. The install never owned it at the old
   * path, so relocating it created a managed file nobody could claim — and the
   * install refused it, rolling back an update whose layout pass had succeeded.
   *
   * Hence the rule above: restorable content is dropped, never relocated. The
   * receipt therefore never needs rewriting, which is why no code does it.
   */
  it('never leaves restorable content where the install cannot claim it', async () => {
    const root = project({ '.void/PHILOSOPHY.md': 'doctrine\n' });

    await migrateVoidLayout(root);

    expect(existsSync(join(root, '.void/PHILOSOPHY.md'))).toBe(false);
    expect(existsSync(join(root, '.void/installed/PHILOSOPHY.md'))).toBe(false);
  });

  /**
   * The three pre-journal streams are dead: nothing writes them, and since
   * 2026-08-18 nothing reads them either. They still migrate — deleting someone's
   * data is not a migration's job — but they are filed apart, so `machine/` holds
   * only live state and removing 3.2 MB of unreadable history is one obvious
   * command instead of a judgement call about eight similar-looking files.
   */
  it('files the retired streams apart from live machine state', async () => {
    const root = project({
      '.void/activations.jsonl': 'a\n',
      '.void/usage.log': 'u\n',
      '.void/runs/a/events.jsonl': 'e\n',
    });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/machine/retired/activations.jsonl'), 'utf8')).toBe('a\n');
    expect(readFileSync(join(root, '.void/machine/retired/usage.log'), 'utf8')).toBe('u\n');
    // Live state stays where readers look for it.
    expect(readFileSync(join(root, '.void/machine/runs/a/events.jsonl'), 'utf8')).toBe('e\n');
    expect(existsSync(join(root, '.void/machine/activations.jsonl'))).toBe(false);
  });

  /**
   * `local/` was a CLOSED set by design — "a new runtime artifact is born inside
   * local/ and this file never has to learn about it" — so everything in it is
   * machine state whatever its name. Migrating only the entries the table knows
   * stranded the rest: found on this very repo, where `.registered` stayed
   * behind and kept the directory alive.
   */
  it('empties the previous machine directory whole, including names it never knew', async () => {
    const root = project({
      '.void/local/runs/a/events.jsonl': 'e\n',
      '.void/local/.registered': 'marker\n',
      '.void/local/some-future-artifact.json': '{}\n',
    });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/machine/runs/a/events.jsonl'), 'utf8')).toBe('e\n');
    expect(readFileSync(join(root, '.void/machine/.registered'), 'utf8')).toBe('marker\n');
    expect(readFileSync(join(root, '.void/machine/some-future-artifact.json'), 'utf8')).toBe('{}\n');
    expect(existsSync(join(root, '.void/local'))).toBe(false);
  });

  it('leaves nothing to do on a second run after a merge', async () => {
    const root = project({
      '.void/cache/x.json': 'old\n',
      '.void/machine/cache/x.json': 'new\n',
    });
    await migrateVoidLayout(root);

    const second = await migrateVoidLayout(root);

    expect(second.moved).toEqual([]);
    expect(second.parked).toEqual([]);
  });

  it('never parks a copy over an existing parked one', async () => {
    const root = project({
      '.void/cache/x.json': 'older\n',
      '.void/machine/cache/x.json': 'new\n',
      '.void/machine/cache/x.json.legacy': 'already-parked\n',
    });

    await migrateVoidLayout(root);

    expect(readFileSync(join(root, '.void/machine/cache/x.json.legacy'), 'utf8')).toBe(
      'already-parked\n',
    );
    expect(existsSync(join(root, '.void/machine/cache/x.json.legacy.2'))).toBe(true);
  });

  it('takes the block back out, preserving the rules the project already had', async () => {
    // The rules now live in `.git/info/exclude`, which no checkout can revert.
    // Leaving a copy here too would keep one branch-dependent source alive.
    const root = project({ '.void/cache/x.json': 'a\n' });
    writeFileSync(join(root, '.gitignore'), `node_modules\ndist/\n\n${gitignoreBlock()}\n`);

    const result = await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(result.gitignoreBlockRemoved).toBe(true);
    expect(ignore).toContain('node_modules');
    expect(ignore).toContain('dist/');
    expect(ignore).not.toContain('.void/machine/');
    expect(ignore).not.toContain('void-harness:begin');
  });

  it('leaves the improvised rule the project wrote itself exactly where it is', async () => {
    // `.void/*` + `!` is the project's own text, not ours. It is reported by
    // doctor, never rewritten — and least of all by a command removing our block.
    const root = project({ '.void/cache/x.json': 'a\n' });
    writeFileSync(join(root, '.gitignore'), `.void/*\n!.void/PROJECT-DOCTRINE.md\n\n${gitignoreBlock()}\n`);

    await migrateVoidLayout(root);
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');

    expect(ignore).toContain('.void/*');
    expect(ignore).toContain('!.void/PROJECT-DOCTRINE.md');
    expect(ignore).not.toContain('void-harness:begin');
  });

  it('never creates a .gitignore just to hold nothing of ours', async () => {
    const root = project({ '.void/cache/x.json': 'a\n' });

    const result = await migrateVoidLayout(root);

    expect(result.gitignoreBlockRemoved).toBe(false);
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });

  it('writes nothing in dry-run, while answering exactly what it would do', async () => {
    const root = project({ '.void/cache/x.json': 'a\n' });
    writeFileSync(join(root, '.gitignore'), `${gitignoreBlock()}\n`);

    const result = await migrateVoidLayout(root, true);

    expect(result.moved).toEqual(['cache']);
    expect(result.gitignoreBlockRemoved).toBe(true);
    expect(existsSync(join(root, '.void/machine/activations.jsonl'))).toBe(false);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('void-harness:begin');
  });

  it('does nothing at all in a project the harness never touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'void-migration-bare-'));
    temporary.push(root);

    const result = await migrateVoidLayout(root);

    expect(result).toEqual({ moved: [], conflicts: [], parked: [], gitignoreBlockRemoved: false });
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
      '.claude/skills/tdd/SKILL.md': '# generated',
    });
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });

    await migrateVoidLayout(root);

    // Asserted by effect, not by the presence of a literal line: the block names
    // the directory now, and only git can say whether the path is covered.
    const status = execFileSync('git', ['check-ignore', '.claude/skills/tdd/SKILL.md'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(status.trim()).toBe('.claude/skills/tdd/SKILL.md');
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
      '.void/cache/x.json': 'old\n',
      '.void/machine/cache/x.json': 'new\n',
    });

    expect(planVoidMigration(root)).toEqual({ movable: ['runs'], conflicts: ['cache'] });
  });
});
