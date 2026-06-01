# Releasing void-harness

How to ship a new version of the marketplace plugins (`void`, `void-monorepo`,
`void-nextjs`). For releasing the CLI (`@voidcorp/harness`), see
[CLI releases](#cli-releases) at the bottom.

## Model: lockstep

While the harness is in active development (pre-1.0), all three plugins share
one version. A patch to `void-nextjs` bumps the whole marketplace. Reasons:

- Plugins share the same `PHILOSOPHY.md` and depend on each other for
  consistency. A pack at v0.3 paired with a core at v0.1 is a support nightmare.
- Consumers run `/plugin marketplace update` once and get everything coherent.
- The cost of an unnecessary bump (incrementing a plugin that didn't change) is
  negligible compared to the cost of debugging version-skew incidents.

When packs diverge meaningfully (real demand for independent release cadences),
we switch to per-plugin versioning. Until then, lockstep.

## Files that carry a version

| File | What it's for |
|---|---|
| `.claude-plugin/marketplace.json` | `plugins[].version` for each plugin. Source of truth read by Claude Code. |
| `packages/core/.claude-plugin/plugin.json` | Core plugin manifest. |
| `packages/packs/pack-monorepo/.claude-plugin/plugin.json` | Monorepo pack manifest. |
| `packages/packs/pack-react/.claude-plugin/plugin.json` | React pack manifest. |
| `packages/packs/pack-nextjs/.claude-plugin/plugin.json` | Next.js pack manifest. |
| `packages/packs/pack-server/.claude-plugin/plugin.json` | Server-side pack manifest. |
| `packages/packs/pack-pwa/.claude-plugin/plugin.json` | PWA pack manifest. |
| `packages/packs/pack-mobile/.claude-plugin/plugin.json` | Mobile pack manifest. |

`packages/cli/core-assets/.claude-plugin/plugin.json` is **generated** at
`prepack` time from `packages/core/.claude-plugin/plugin.json` — do not edit.

## The flow

```bash
# 1. Decide the bump (semver discipline applies: breaking -> major, feature -> minor, fix -> patch)
node scripts/bump-version.mjs minor       # or: patch | major | 0.2.0

# 2. Inspect the diff
git diff

# 3. Commit
git commit -am "chore: release v0.2.0"

# 4. Tag
git tag v0.2.0

# 5. Push
git push && git push --tags
```

Consumers refresh by running `/plugin marketplace update` inside Claude Code.
They can detect available updates ahead of time with `void-harness check` (or
implicitly via `void-harness doctor`, which runs the remote check by default).

## What counts as breaking

For pre-1.0, we follow caret-incompatible semver:

- **Major** (any pre-1.0 bump of the minor): renames or removes a skill, a hook,
  or a manifest field consumers reference. Changes the location of doctrine
  files. Any change that forces a consumer to edit code or run extra commands.
- **Minor**: new skill, new hook, new pack, additive change to PHILOSOPHY.md.
- **Patch**: skill content edits, hook fixes, doc corrections, internal
  refactors with no consumer-visible change.

When in doubt, prefer minor over patch — consumers are alerted either way.

## First-bump formatting note

The first run of `bump-version.mjs` normalizes JSON formatting (2-space
indent, multi-line arrays). Subsequent bumps touch only the `version` line.
This is intentional: the script uses `JSON.stringify(value, null, 2)` so we
don't carry a hand-tuned formatter just for these manifests.

## CLI releases

The CLI (`packages/cli`) is published to npm independently via **changesets**:

```bash
cd packages/cli
pnpm changeset                    # interactive: pick bump + write notes
pnpm changeset version            # apply pending changesets to package.json + CHANGELOG.md
git commit -am "chore(cli): release"
pnpm release                      # runs changeset publish
```

CLI version is **not** tied to plugin version. Consumers upgrade the CLI via
`pnpm add -g @voidcorp/harness@latest`; they refresh plugins via
`/plugin marketplace update` inside Claude Code.
