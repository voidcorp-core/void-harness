// Who owns each path the harness materializes, and therefore what git does with it.
//
// The problem this solves is not cosmetic. `.void/` held two things with
// opposite lifecycles — what the project DECLARES (config.json,
// PROJECT-DOCTRINE.md: authored, reviewed, pushed) and what the harness OBSERVES
// (telemetry, run journals, caches: machine-local, never shipped) — and nothing
// separated them, so every project improvised its own ignore rule over a vacuum.
// The one that prompted this read:
//
//     .void/*
//     !.void/PROJECT-DOCTRINE.md
//
// It rescued the doctrine and silently ignored `config.json` with it — the file
// carrying the pack pins and `paths.business`, the glob the enforcement runner
// reads to decide what the TDD guard covers. A teammate cloning that repo got the
// doctrine and no enforcement configuration, with nothing reporting it.
//
// The fix is a classification, not a longer exception list:
//
//   project   the project authors it, the harness never overwrites it, it ships
//   derived   materialized from the pinned version, reproducible by `install`
//   observed  machine-local history, meaningless in another checkout
//
// Observed state moves under `.void/local/`, so its ignore rule is one line with
// no `!` and — the property that actually matters — stops needing maintenance: a
// new runtime artifact is born inside `local/` and no ignore file learns about it.
//
// `derived` is classified here but deliberately NOT ignored yet. It can only move
// as a whole: `.claude/settings.json` is `project` and references
// `.void/hooks/_void-hook.mjs`, so ignoring the hooks without treating settings
// and the runtime skill directories in the same change leaves a repo that is
// broken on clone. That call is its own decision.
//
// Pure except for the three functions documented as touching the filesystem.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const VOID_DIR = '.void';
export const VOID_LOCAL_DIR = 'local';

/** What a materialized path is, which is what decides whether git keeps it. */
export type Ownership = 'project' | 'derived' | 'observed';

/**
 * Ownership of every direct child of `.void/`, and the single source of truth the
 * ignore rule, the migration and `doctor` all read. A second copy of this
 * anywhere would let `update` move a file the ignore rule does not cover, and the
 * next commit would ship telemetry.
 */
export const VOID_OWNERSHIP: Readonly<Record<string, Ownership>> = Object.freeze({
  // Declared: authored or hand-edited, never regenerable from a pin.
  'config.json': 'project',
  'PROJECT-DOCTRINE.md': 'project',
  'pricing.json': 'project',
  policies: 'project',
  profiles: 'project',
  organization: 'project',

  // Derived: `void-harness install` reproduces these from config.json's pin.
  'PHILOSOPHY.md': 'derived',
  hooks: 'derived',

  // Observed: this machine's history. Never meaningful in another checkout.
  runs: 'observed',
  cache: 'observed',
  outputs: 'observed',
  generated: 'observed',
  archives: 'observed',
  autopilot: 'observed',
  receipts: 'observed',
  history: 'observed',
  worktrees: 'observed',
  'autonomous-runs': 'observed',
  'state.json': 'observed',
  'activations.jsonl': 'observed',
  'outcomes.jsonl': 'observed',
  'usage.log': 'observed',
  '.registered': 'observed',
});

/** The observed entries, sorted — what moves under `local/` and what git ignores. */
export const LOCAL_ENTRIES: readonly string[] = Object.freeze(
  Object.keys(VOID_OWNERSHIP)
    .filter((entry) => VOID_OWNERSHIP[entry] === 'observed')
    .sort(),
);

const BEGIN_MARKER = '# void-harness:begin';
const END_MARKER = '# void-harness:end';

/**
 * Ownership of a direct child of `.void/`. An entry this version has never heard
 * of answers `project`, and that is the safe answer rather than the lax one:
 * `local/` is a CLOSED set — every observed writer in the harness now writes
 * inside it — so a stranger at the top of `.void/` cannot be our telemetry. It is
 * someone's file, and the failure of guessing wrong is "doctor tells a project to
 * untrack its own data", which is worse than tracking one unknown path.
 *
 * The legacy names left over from before the split are enumerated above, so they
 * are recognised as observed rather than falling through to this default.
 */
export function ownershipOf(entry: string): Ownership {
  return VOID_OWNERSHIP[entry] ?? 'project';
}

/** True when this direct child of `.void/` is observed state rather than declared. */
export function isLocalEntry(entry: string): boolean {
  return ownershipOf(entry) === 'observed';
}

/** `<root>/.void` — holds the declared half, tracked by git in full. */
export function voidDir(root: string): string {
  return join(root, VOID_DIR);
}

/** `<root>/.void/local` — the observed half, covered by one ignore rule. */
export function voidLocalDir(root: string): string {
  return join(root, VOID_DIR, VOID_LOCAL_DIR);
}

/** Path to an observed artifact at its post-split location. Writers use this. */
export function voidLocalPath(root: string, ...segments: readonly string[]): string {
  return join(voidLocalDir(root), ...segments);
}

/** Path to an artifact at its pre-split location. Readers use this only as a fallback. */
export function legacyVoidPath(root: string, ...segments: readonly string[]): string {
  return join(voidDir(root), ...segments);
}

/**
 * Where to READ an observed artifact: the migrated path when it exists, the
 * pre-split one while it still holds the data, and the migrated path when neither
 * does (so a writer handed this creates the right one).
 *
 * Touches the filesystem. The fallback is what stops a project that has not run
 * `update` yet from reporting months of telemetry as none.
 */
export function voidLocalReadPath(root: string, ...segments: readonly string[]): string {
  const migrated = voidLocalPath(root, ...segments);
  if (existsSync(migrated)) return migrated;
  const legacy = legacyVoidPath(root, ...segments);
  return existsSync(legacy) ? legacy : migrated;
}

/**
 * The observed artifacts still sitting at the pre-split location, for `update` to
 * move. Sorted, and empty for a project already migrated or never installed.
 *
 * Touches the filesystem.
 */
export function pendingMigrations(root: string): string[] {
  return LOCAL_ENTRIES.filter((entry) => existsSync(legacyVoidPath(root, entry))).sort();
}

/** The managed `.gitignore` block: one rule, no exception, carrying its own why. */
export function gitignoreBlock(): string {
  return [
    BEGIN_MARKER,
    '# Everything the harness OBSERVES (telemetry, run journals, caches, install',
    '# receipts) lives under .void/local/ and is machine-local. Everything the',
    '# project DECLARES (config.json, PROJECT-DOCTRINE.md, policies/) stays tracked',
    '# at the top of .void/ — config.json in particular carries the pack pins and',
    '# paths.business, which the enforcement runner needs on a fresh clone.',
    '# One rule, no exception: a new runtime artifact is born inside local/ and this',
    '# file never has to learn about it.',
    `${VOID_DIR}/${VOID_LOCAL_DIR}/`,
    END_MARKER,
  ].join('\n');
}

/**
 * Add or refresh the managed block in a `.gitignore`, leaving every rule the
 * project wrote itself untouched. Idempotent: patching an already-patched file
 * returns it unchanged.
 */
export function patchGitignore(original: string): string {
  const block = gitignoreBlock();
  const begin = original.indexOf(BEGIN_MARKER);
  const end = original.indexOf(END_MARKER);
  if (begin !== -1 && end !== -1) {
    const replaced = `${original.slice(0, begin)}${block}${original.slice(end + END_MARKER.length)}`;
    return replaced.endsWith('\n') ? replaced : `${replaced}\n`;
  }
  const base = original === '' || original.endsWith('\n') ? original : `${original}\n`;
  return `${base}${base === '' ? '' : '\n'}${block}\n`;
}
