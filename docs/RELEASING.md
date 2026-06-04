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

## The flow (automated — you do not hand-bump)

Releasing is driven by **release-please** off the Conventional Commits this repo
already enforces. No one runs the bump script by hand in the normal path.

1. **Merge feature/fix PRs to `main` as usual.** `feat:` → minor, `fix:` → patch,
   a breaking change → minor (pre-1.0; `bump-minor-pre-major`). `docs:`/`chore:`/
   `ci:`/`test:` alone do not trigger a release.
2. **release-please maintains a single "release PR"** (`.github/workflows/release.yml`).
   It computes the next version, bumps it across **every** manifest at once (via
   `extra-files` in `release-please-config.json` — the same file list as the bump
   script, plus the core-assets mirror), and writes `CHANGELOG.md`.
3. **Merge the release PR when you want to cut the release.** That tags `vX.Y.Z`
   and creates the GitHub release. This merge is the only human gate (HITL).
4. **(When ready to publish to npm)** `pnpm -r --filter './packages/**' publish`.
   Not wired into the workflow yet — the package is not published.

A CI step (`pnpm version:check`, `scripts/check-version-lockstep.mjs`) fails the
build if **any** manifest drifts from the canonical version — so a missed file
(by release-please, the manual script, or a hand-edit) can never ship.

### Manual fallback

`scripts/bump-version.mjs <patch|minor|major|X.Y.Z>` still bumps all manifests in
lockstep for an emergency/offline release. After it, run
`pnpm --filter @voidcorp/harness build:assets` to sync the mirror, commit
`chore: release vX.Y.Z`, tag, push. Prefer the automated flow.

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

## Why release-please, not changesets

We chose **release-please**: it derives the bump from Conventional Commits (which
we already enforce), so there is no per-PR ceremony, and its `extra-files` config
bumps all our non-npm manifests (marketplace + 7 plugin.json + mirror) in lockstep
from one canonical version. The release PR keeps a human gate.

[changesets](https://github.com/changesets/changesets) was used earlier for CLI
npm versioning and removed in v0.5.4: its model (independent versions per package,
per-package CHANGELOGs) contradicts the single-number lockstep. If runtime npm
cadence ever splits from marketplace cadence (post-1.0), revisit.

## CHANGELOG

`CHANGELOG.md` is generated and maintained by release-please from the Conventional
Commit history (grouped Features / Bug Fixes). Do not hand-edit it.
