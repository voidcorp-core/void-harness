import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyMaterialized,
  derivedIgnoreEntries,
  isOwnedDerived,
  MACHINE_ENTRIES,
  VOID_DIR,
  VOID_MACHINE_DIR,
  gitignoreBlock,
  isMachineEntry,
  legacyVoidPath,
  ownershipOf,
  patchGitignore,
  pendingMigrations,
  voidMachinePath,
  voidReadPath,
} from './void-layout.js';

const temporary: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'void-layout-'));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('ownership decides what git keeps', () => {
  it('classes what the project authors as project state', () => {
    for (const entry of ['config.json', 'PROJECT-DOCTRINE.md', 'policies', 'profiles']) {
      expect(ownershipOf(entry), entry).toBe('project');
    }
  });

  it('classes what install reproduces from the pin as derived', () => {
    for (const entry of ['PHILOSOPHY.md', 'hooks']) expect(ownershipOf(entry), entry).toBe('derived');
  });

  it('treats a stranger at the top of .void as the project\'s own', () => {
    // `local/` is a closed set: every observed writer now writes inside it, so an
    // unrecognised path at the top cannot be our telemetry. Guessing "observed"
    // here would have doctor tell a project to untrack its own data — which is
    // exactly what it did for this repo's own `.void/harness-feedback/`.
    expect(ownershipOf('harness-feedback')).toBe('project');
    expect(isMachineEntry('harness-feedback')).toBe(false);
  });

  it('still recognises the pre-split names as observed', () => {
    // They predate `local/`, so they cannot rely on the closed-set argument.
    expect(ownershipOf('usage.log')).toBe('observed');
    expect(ownershipOf('activations.jsonl')).toBe('observed');
  });

  it('never moves derived state under local/, whatever git does with it', () => {
    // Derived state is regenerated in place by `install`; only its git treatment
    // is in question, never its location. Moving it would break the paths
    // `.claude/settings.json` and the runtimes resolve by name.
    expect(isMachineEntry('hooks')).toBe(false);
    expect(pendingMigrations('/nonexistent')).not.toContain('hooks');
  });
});

describe('the two natures of .void', () => {
  it('writes observed state under .void/local, never beside what the project declares', () => {
    expect(voidMachinePath('/p', 'runs', 'mis_1')).toBe(join('/p', '.void', 'local', 'runs', 'mis_1'));
  });

  it('keeps declared state at the top of .void, where git can see it', () => {
    // config.json and PROJECT-DOCTRINE.md are the two the project owns and ships.
    expect(isMachineEntry('config.json')).toBe(false);
    expect(isMachineEntry('PROJECT-DOCTRINE.md')).toBe(false);
  });

  it('classifies every observed artifact as local', () => {
    for (const entry of ['runs', 'cache', 'outputs', 'generated', 'archives', 'autopilot', 'receipts', 'history', 'state.json', 'activations.jsonl', 'outcomes.jsonl']) {
      expect(isMachineEntry(entry), entry).toBe(true);
    }
  });
});

describe('reading across the split', () => {
  it('prefers the migrated path', () => {
    const root = scratch();
    mkdirSync(join(root, VOID_DIR, VOID_MACHINE_DIR), { recursive: true });
    writeFileSync(join(root, VOID_DIR, VOID_MACHINE_DIR, 'activations.jsonl'), '');

    expect(voidReadPath(root, 'activations.jsonl')).toBe(voidMachinePath(root, 'activations.jsonl'));
  });

  it('falls back to the pre-split path so an unmigrated project keeps its history', () => {
    // The migration runs on `update`. Until it does, a reader that only knew the
    // new path would report a project with months of telemetry as having none.
    const root = scratch();
    mkdirSync(join(root, VOID_DIR), { recursive: true });
    writeFileSync(join(root, VOID_DIR, 'activations.jsonl'), '');

    expect(voidReadPath(root, 'activations.jsonl')).toBe(legacyVoidPath(root, 'activations.jsonl'));
  });

  it('returns the migrated path when neither exists, so writers create the right one', () => {
    const root = scratch();

    expect(voidReadPath(root, 'activations.jsonl')).toBe(voidMachinePath(root, 'activations.jsonl'));
  });
});

describe('what update has to move', () => {
  it('reports nothing for a project already on the new layout', () => {
    const root = scratch();
    mkdirSync(join(root, VOID_DIR, VOID_MACHINE_DIR, 'runs'), { recursive: true });

    expect(pendingMigrations(root)).toEqual([]);
  });

  it('reports nothing for a project that never ran the harness', () => {
    expect(pendingMigrations(scratch())).toEqual([]);
  });

  it('lists only the observed artifacts left at the old location', () => {
    const root = scratch();
    mkdirSync(join(root, VOID_DIR, 'runs'), { recursive: true });
    writeFileSync(join(root, VOID_DIR, 'activations.jsonl'), '');
    writeFileSync(join(root, VOID_DIR, 'config.json'), '{}');
    writeFileSync(join(root, VOID_DIR, 'PROJECT-DOCTRINE.md'), '#');

    // config.json and the doctrine stay put: they are the reason the split exists.
    expect(pendingMigrations(root).sort()).toEqual(['activations.jsonl', 'runs']);
  });
});

describe('ownership comes from the receipt, never from the directory', () => {
  const RECEIPT = [
    '.claude/skills/tdd/SKILL.md',
    '.claude/skills/tdd/references/cycle.md',
    '.agents/skills/tdd/SKILL.md',
    '.claude/agents/doctrine-critic.md',
    '.void/PHILOSOPHY.md',
    '.void/hooks/_void-hook.mjs',
    '.codex/hooks.json',
    '.claude/settings.json',
  ];

  it("never covers a skill the project wrote itself", () => {
    // THE regression this exists for. `.claude/skills/` is shared: Claude Code
    // reads a project's own skills from it and the harness merely also writes
    // there. Classifying the directory would ignore hand-written content and let
    // `--untrack-derived` drop it from the index.
    const entries = derivedIgnoreEntries(RECEIPT);

    expect(entries).not.toContain('.claude/skills/');
    expect(entries.some((entry) => entry.includes('custom'))).toBe(false);
    expect(isOwnedDerived('.claude/skills/custom/SKILL.md')).toBe(true);
    // ...but it is not in the receipt, so it never reaches an ignore entry:
    expect(derivedIgnoreEntries(['.claude/skills/custom/SKILL.md'])).toEqual(['.claude/skills/custom/']);
    expect(entries.filter((entry) => entry.startsWith('.claude/skills/'))).toEqual(['.claude/skills/tdd/']);
  });

  it('collapses an owned unit to its directory, so the block stays readable', () => {
    // Two receipt files under the same skill produce one entry, not two.
    expect(derivedIgnoreEntries(RECEIPT)).toContain('.claude/skills/tdd/');
  });

  it('lists a standalone owned file exactly', () => {
    expect(derivedIgnoreEntries(RECEIPT)).toContain('.void/PHILOSOPHY.md');
  });

  it('does not collapse a flat unit root, where the unit IS the file', () => {
    // `.claude/agents/` holds files directly. Emitting
    // `.claude/agents/doctrine-critic.md/` with a trailing slash matches a
    // directory that does not exist, so git ignored none of them — caught by
    // dogfooding, not by the unit tests that preceded it.
    const entries = derivedIgnoreEntries(['.claude/agents/doctrine-critic.md']);

    expect(entries).toEqual(['.claude/agents/doctrine-critic.md']);
    expect(entries[0]?.endsWith('/')).toBe(false);
  });

  it('never lists what a fresh clone needs to work', () => {
    const entries = derivedIgnoreEntries(RECEIPT);

    expect(entries).not.toContain('.void/hooks/_void-hook.mjs');
    expect(entries).not.toContain('.codex/hooks.json');
    expect(isOwnedDerived('.void/hooks/_void-hook.mjs')).toBe(false);
    expect(isOwnedDerived('.codex/hooks.json')).toBe(false);
  });

  it('never lists project state, even when the receipt owns it', () => {
    expect(derivedIgnoreEntries(RECEIPT)).not.toContain('.claude/settings.json');
    expect(isOwnedDerived('.claude/settings.json')).toBe(false);
  });

  it('leaves anything outside the materialized surface alone', () => {
    expect(classifyMaterialized('src/index.ts')).toBeUndefined();
    expect(isOwnedDerived('src/index.ts')).toBe(false);
    expect(derivedIgnoreEntries(['src/index.ts'])).toEqual([]);
  });

  it('reads a Windows-style path the same way', () => {
    expect(derivedIgnoreEntries(['.claude\\skills\\tdd\\SKILL.md'])).toEqual(['.claude/skills/tdd/']);
  });

  it('covers observed state only when no receipt is readable', () => {
    // A project whose receipt is missing must not get a block claiming to cover
    // content nobody proved the harness owns.
    const rules = gitignoreBlock().split('\n').filter((l) => l !== '' && !l.startsWith('#'));

    expect(rules).toEqual(['.void/local/']);
  });
});

describe('the ignore rule', () => {
  it('carries no exception rule to maintain', () => {
    // The whole point of the split: no `!` rescue rule, because a rescue rule is
    // what silently left config.json ignored in the project that prompted this.
    const rules = gitignoreBlock().split('\n').filter((l) => l !== '' && !l.startsWith('#'));

    expect(rules).toContain('.void/local/');
    expect(rules.some((rule) => rule.startsWith('!'))).toBe(false);
  });

  it('lists exactly the entries it was given, and no load-bearing path', () => {
    const entries = derivedIgnoreEntries(['.claude/skills/tdd/SKILL.md', '.void/hooks/_void-hook.mjs']);
    const rules = gitignoreBlock(entries).split('\n').filter((l) => l !== '' && !l.startsWith('#'));

    expect(rules).toContain('.claude/skills/tdd/');
    expect(rules).not.toContain('.void/hooks/_void-hook.mjs');
  });

  it('adds the block to a gitignore that has none', () => {
    const patched = patchGitignore('node_modules\n');

    expect(patched).toContain('node_modules');
    expect(patched).toContain('.void/local/');
  });

  it('is idempotent — patching twice changes nothing the second time', () => {
    const once = patchGitignore('node_modules\n');

    expect(patchGitignore(once)).toBe(once);
  });

  it('replaces its own block in place rather than appending a second one', () => {
    const stale = patchGitignore('node_modules\n').replace('.void/local/', '.void/OLD/');
    const patched = patchGitignore(stale);

    expect(patched).toContain('.void/local/');
    expect(patched).not.toContain('.void/OLD/');
    expect(patched.match(/void-harness:begin/g)).toHaveLength(1);
  });

  it('never touches rules the project wrote itself', () => {
    const patched = patchGitignore('node_modules\ndist/\n.env\n');

    for (const rule of ['node_modules', 'dist/', '.env']) expect(patched).toContain(rule);
  });

  it('ends with a newline, so the next appended rule is not glued to ours', () => {
    expect(patchGitignore('node_modules\n').endsWith('\n')).toBe(true);
  });
});

describe('MACHINE_ENTRIES', () => {
  it('is the single list both the ignore rule and the migration read', () => {
    // If these ever diverge, `update` moves a file the ignore rule does not
    // cover, and the next commit ships telemetry.
    for (const entry of MACHINE_ENTRIES) expect(isMachineEntry(entry)).toBe(true);
  });
});
