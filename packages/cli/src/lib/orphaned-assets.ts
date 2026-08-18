// Assets the harness wrote, that it no longer owns, still sitting on disk.
//
// An update preserves an asset that was edited by hand, which is right: the
// bytes stopped matching what we wrote, so it is not ours to delete. `update`
// says so once. The run after that, the receipt has been rewritten without it
// and nothing mentions it again, so a skill renamed in July goes on loading
// beside its replacement while every check reports green. The project carries
// two versions of its own doctrine and nothing says which one is answering.
//
// It cannot be found by absence. A skill the project wrote itself is equally
// absent from the manifest, and `.claude/skills/` is deliberately shared: the
// managed ignore block lists assets one by one rather than the directory, so
// that a hand-written skill stays visible to git. Reporting everything unowned
// would flag exactly the files a project is entitled to keep.
//
// So the signal is positive rather than negative: the harness's own assets are
// self-identifying. Every shipped SKILL.md carries `name`, `kind`, `owner`,
// `runtimes` and `enforcement` in its frontmatter, and that shape is what marks
// provenance. It stays true long after the receipt has forgotten the file, which
// is the property a receipt-based check could not offer.

/** Frontmatter keys the harness writes into every asset it ships. */
const AUTHORED_KEYS = ['kind:', 'owner:', 'runtimes:', 'enforcement:'];

/**
 * Enough of the shape to be provenance rather than coincidence. Two keys can
 * meet by accident in a hand-written file; three is a signature. Requiring all
 * of them would instead make the check brittle to a field being added or
 * dropped, which happens on our side, not the project's.
 */
const AUTHORED_MINIMUM = 3;

export interface DiscoveredAsset {
  readonly path: string;
  readonly harnessAuthored: boolean;
}

/** Does this file carry the frontmatter the harness writes into what it ships? */
export function looksHarnessAuthored(contents: string): boolean {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents) ?? undefined;
  if (frontmatter === undefined) return false;
  const lines = (frontmatter[1] ?? '').split(/\r?\n/);
  const present = AUTHORED_KEYS.filter((key) => lines.some((line) => line.startsWith(key)));
  return present.length >= AUTHORED_MINIMUM;
}

/**
 * On disk, harness-shaped, and not owned by the manifest. Sorted, so the same
 * tree produces the same report twice.
 */
export function orphanedAssets(
  discovered: readonly DiscoveredAsset[],
  owned: ReadonlySet<string>,
): string[] {
  return discovered
    .filter((asset) => asset.harnessAuthored && !owned.has(asset.path))
    .map((asset) => asset.path)
    .sort();
}
