// Files the harness and the project both write into.
//
// A managed asset is ours alone: `update` recompiles it, and the transaction
// refuses to overwrite one that was edited by hand, because the edit belongs to
// somebody. A co-owned file is the opposite arrangement -- the harness owns
// exactly its marked block and the project owns every other line, so an edit
// outside the block is the file being used as intended, not damage.
//
// The list lives alone, in a module that imports nothing, because two places
// need it and they sit on opposite sides of a dependency edge: the install
// composes the stage from it, and the manifest verification reads it to tell a
// project's own writing apart from drift. Keeping a second copy in either one is
// how the two answers start disagreeing.

/**
 * The project's own doctrine. Co-owned in the widest sense -- the harness seeds
 * it once and every line after that is the project's -- and named here because
 * `init` and the manifest both have to point at exactly this path.
 */
export const PROJECT_DOCTRINE_PATH = '.void/PROJECT-DOCTRINE.md';

/** Paths the harness patches a block into rather than owning outright. */
export const CO_OWNED_FILES = [
  '.gitignore',
  '.void/config.json',
  PROJECT_DOCTRINE_PATH,
  '.claude/settings.json',
  'CLAUDE.md',
  'AGENTS.md',
] as const;

const CO_OWNED = new Set<string>(CO_OWNED_FILES);

/**
 * Is this path one the project is invited to write into?
 *
 * Asked of a manifest path, which is always project-relative and slash-separated.
 */
export function isCoOwned(path: string): boolean {
  return CO_OWNED.has(path);
}
