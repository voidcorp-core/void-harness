# Releasing void-harness

How to ship a new version. One model, one number — everything moves together.

## Model: total lockstep (pre-1.0)

While the harness is pre-1.0, **one version governs everything**:

- Marketplace plugin manifests (`marketplace.json` + each `plugin.json`)
- CLI npm package (`@voidcorp/harness`)
- Runtime npm packages (`@voidcorp/pack-monorepo`, `@voidcorp/pack-nextjs`, …)

A skill change, a CLI bugfix, and a runtime helper addition all ship under the same version bump.

### Why one number

- **Coherence.** A skill that references a runtime helper ships in the same version as that helper.
- **Trace.** `void-harness --version` matches `pnpm view @voidcorp/pack-nextjs version` matches the marketplace HEAD.
- **No skew incidents.** Pre-1.0, every divergence is a support nightmare. Lockstep eliminates the question.

### When we might split (post-1.0)

If runtime npm packages and Claude Code plugins develop genuinely independent cadences (multiple pack runtime patches between marketplace releases), we revisit. Until that's a real observed problem, single number stays.

## Files that carry a version

The bump script touches **all of these**. Don't edit them by hand.

| File | What it's for |
|---|---|
| `.claude-plugin/marketplace.json` | `plugins[].version` for each plugin. Source of truth read by Claude Code. |
| `packages/core/.claude-plugin/plugin.json` | Core plugin manifest. |
| `packages/packs/<pack>/.claude-plugin/plugin.json` (6 files) | Each pack's plugin manifest. |
| `packages/cli/package.json` | CLI npm package version. |
| `packages/packs/<pack>/package.json` (3 files currently) | Runtime npm packages with shipped code. |

`packages/cli/core-assets/.claude-plugin/plugin.json` is **generated** at `prepack` time — do not edit.

## The flow

```bash
# 1. Decide the bump (semver applies: breaking → major, feature → minor, fix → patch)
node scripts/bump-version.mjs minor       # or: patch | major | X.Y.Z

# 2. Inspect the diff
git diff

# 3. Commit
git commit -am "chore: release vX.Y.Z"

# 4. Tag
git tag vX.Y.Z

# 5. Push
git push && git push --tags

# 6. (When ready to publish runtime helpers to npm)
pnpm -r --filter './packages/**' publish
```

Consumers on a project pull the new version with:

```bash
void-harness update    # refresh marketplace cache + bump .void/config.json pins
# then restart Claude Code
```

## What counts as breaking

For pre-1.0 we use caret-incompatible semver (`^0.5.x` matches `0.5.*`, not `0.6.*`):

- **Major** (or any minor bump pre-1.0): removes/renames a skill, hook, agent, or manifest field consumers reference. Changes the location of doctrine files. Changes a runtime npm package's public API in a breaking way.
- **Minor**: new skill, new hook, new pack, new runtime export. Additive change to PHILOSOPHY.md.
- **Patch**: skill content edits, hook bugfixes, CLI bugfixes, internal refactors with no consumer-visible API change.

When in doubt, prefer minor over patch — consumers are alerted either way.

## First-bump formatting note

The first run of `bump-version.mjs` normalizes JSON formatting (2-space indent, multi-line arrays). Subsequent bumps touch only the `version` line. Intentional — the script uses `JSON.stringify(value, null, 2)` so we don't carry a hand-tuned formatter just for these manifests.

## Why no changesets

We previously used [changesets](https://github.com/changesets/changesets) for CLI npm versioning. Removed in v0.5.4 because changesets philosophy (independent versions per package, per-package CHANGELOGs) contradicts the lockstep model. One bump script, one number.

If we ever split runtime npm cadence from marketplace cadence (post-1.0), changesets becomes the right tool again — easy to add back.

## CHANGELOG

We currently keep release notes in commit messages (conventional commits with WHY). Once we publish to npm, we'll generate a CHANGELOG.md per release tag via `git log v<prev>..v<next>` and curate. For now, the commit history IS the changelog.
