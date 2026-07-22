---
date: 2026-07-22
title: "the plugin marketplace is self-hosted in void-harness, not a dedicated catalog repo"
---

## 2026-07-22: the plugin marketplace is self-hosted in void-harness, not a dedicated catalog repo

The Claude Code plugin marketplace moves from a dedicated catalog repo
(`voidcorp-core/void-plugins`, which referenced this repo via `git-subdir` + a
commit sha per entry) into **this repo**: a `.claude-plugin/marketplace.json` at
the root lists every plugin as a **local subdirectory** (`./packages/core`,
`./packages/packs/pack-*`). `MARKETPLACE_REPO` becomes `voidcorp-core/void-harness`.

The credible alternative was keeping the dedicated `void-plugins` catalog.
Rejected: it duplicated the plugin set in a second repo, required a `bump-shas`
step to re-pin every entry on each release (a drift surface), and — once
void-harness itself goes public — added a second public repo for no gain. The
official Claude Code docs support a relative/local `source` (`"./packages/core"`),
resolved from the marketplace repo root, versioned by each plugin's own
`plugin.json` at HEAD — no manual sha pinning. That makes the plugin.json the
single source of truth and collapses the two repos into one.

Load-bearing constraints preserved:

- **`MARKETPLACE_NAME` stays `voidcorp`.** Existing installs carry
  `harness@voidcorp` in `enabledPlugins`; renaming the marketplace would break
  them. Only the repo moved.
- **Back-compat.** Installs that already point `extraKnownMarketplaces.voidcorp`
  at `void-plugins` keep working (that repo still resolves via its pinned
  git-subdir); `marketplaceRepoFrom(settings, …)` reads the repo from settings,
  so only *new* inits target the self-hosted catalog. `void-plugins` is kept
  alive, deprecated, until installs migrate.
- **Version resolution.** `remote.ts` `pinnedCoordinates` now resolves a local
  string source into the marketplace repo at HEAD (`{ repo: marketplaceRepo,
  basePath: <path>/, ref: HEAD }`), so `check`/`doctor`/`update` read the version
  from `packages/<x>/.claude-plugin/plugin.json` in this repo. A catalog
  invariants test freezes that the entry set is exactly core + every pack and
  each source dir exists with a `plugin.json`.

Real end-to-end resolution (Claude Code `/plugin marketplace add
voidcorp-core/void-harness`) can only be exercised once the repo is public; the
structure, remote-version logic, and invariants are covered by unit tests.

Supersedes the marketplace-secondary-channel note of 2026-07-21 (the channel is
unchanged — optional secondary; only its hosting moved).
