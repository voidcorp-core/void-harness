import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCAL_ENTRIES,
  VOID_DIR,
  VOID_LOCAL_DIR,
  gitignoreBlock,
  isLocalEntry,
  legacyVoidPath,
  ownershipOf,
  patchGitignore,
  pendingMigrations,
  voidLocalPath,
  voidLocalReadPath,
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
    expect(isLocalEntry('harness-feedback')).toBe(false);
  });

  it('still recognises the pre-split names as observed', () => {
    // They predate `local/`, so they cannot rely on the closed-set argument.
    expect(ownershipOf('usage.log')).toBe('observed');
    expect(ownershipOf('activations.jsonl')).toBe('observed');
  });

  it('does not ignore derived state, because it cannot move alone', () => {
    // `.claude/settings.json` is project state and references
    // `.void/hooks/_void-hook.mjs`. Ignoring the hooks without moving settings and
    // the runtime skill dirs in the same change breaks the repo on clone.
    expect(isLocalEntry('hooks')).toBe(false);
    expect(pendingMigrations('/nonexistent')).not.toContain('hooks');
  });
});

describe('the two natures of .void', () => {
  it('writes observed state under .void/local, never beside what the project declares', () => {
    expect(voidLocalPath('/p', 'runs', 'mis_1')).toBe(join('/p', '.void', 'local', 'runs', 'mis_1'));
  });

  it('keeps declared state at the top of .void, where git can see it', () => {
    // config.json and PROJECT-DOCTRINE.md are the two the project owns and ships.
    expect(isLocalEntry('config.json')).toBe(false);
    expect(isLocalEntry('PROJECT-DOCTRINE.md')).toBe(false);
  });

  it('classifies every observed artifact as local', () => {
    for (const entry of ['runs', 'cache', 'outputs', 'generated', 'archives', 'autopilot', 'receipts', 'history', 'state.json', 'activations.jsonl', 'outcomes.jsonl']) {
      expect(isLocalEntry(entry), entry).toBe(true);
    }
  });
});

describe('reading across the split', () => {
  it('prefers the migrated path', () => {
    const root = scratch();
    mkdirSync(join(root, VOID_DIR, VOID_LOCAL_DIR), { recursive: true });
    writeFileSync(join(root, VOID_DIR, VOID_LOCAL_DIR, 'activations.jsonl'), '');

    expect(voidLocalReadPath(root, 'activations.jsonl')).toBe(voidLocalPath(root, 'activations.jsonl'));
  });

  it('falls back to the pre-split path so an unmigrated project keeps its history', () => {
    // The migration runs on `update`. Until it does, a reader that only knew the
    // new path would report a project with months of telemetry as having none.
    const root = scratch();
    mkdirSync(join(root, VOID_DIR), { recursive: true });
    writeFileSync(join(root, VOID_DIR, 'activations.jsonl'), '');

    expect(voidLocalReadPath(root, 'activations.jsonl')).toBe(legacyVoidPath(root, 'activations.jsonl'));
  });

  it('returns the migrated path when neither exists, so writers create the right one', () => {
    const root = scratch();

    expect(voidLocalReadPath(root, 'activations.jsonl')).toBe(voidLocalPath(root, 'activations.jsonl'));
  });
});

describe('what update has to move', () => {
  it('reports nothing for a project already on the new layout', () => {
    const root = scratch();
    mkdirSync(join(root, VOID_DIR, VOID_LOCAL_DIR, 'runs'), { recursive: true });

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

describe('the ignore rule', () => {
  it('is a single line with no exception to maintain', () => {
    // The whole point of the split: no `!` rescue rule, because a rescue rule is
    // what silently left config.json ignored in the project that prompted this.
    const rules = gitignoreBlock().split('\n').filter((l) => l !== '' && !l.startsWith('#'));

    expect(rules).toEqual(['.void/local/']);
    expect(rules.some((rule) => rule.startsWith('!'))).toBe(false);
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

describe('LOCAL_ENTRIES', () => {
  it('is the single list both the ignore rule and the migration read', () => {
    // If these ever diverge, `update` moves a file the ignore rule does not
    // cover, and the next commit ships telemetry.
    for (const entry of LOCAL_ENTRIES) expect(isLocalEntry(entry)).toBe(true);
  });
});
