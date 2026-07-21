---
date: 2026-07-09
title: "distribution is marketplace-only; the CLI is maintainer tooling (issue #69)"
---

## 2026-07-09: distribution is marketplace-only; the CLI is maintainer tooling (issue #69)

The harness ships **only** through the Claude Code marketplace
(`voidcorp-core/void-plugins`, pinned by commit sha). The `@voidcorp/harness` npm package is
deliberately **not** published, and `void-harness init/add/doctor/...` is maintainer tooling run
from a checkout of this repo, not a consumer-facing binary. Docs, `help.ts`, and the `/void-*`
command bodies were pointing consumers at `npx @voidcorp/harness`, which 404s (the package is
unpublished and `npx` does not resolve a pnpm global link) — a broken first impression. They now
lead with the marketplace flow and, where the CLI is genuinely needed, mark it as maintainer-only
(a missing `void-harness` binary reports "maintainer CLI not installed", never an npm fetch).

The credible alternative was to publish `@voidcorp/harness` to npm so `npx` works everywhere
(friction 2026-06-18, option 1). Rejected: the marketplace already distributes the load-bearing
surface (skills, hooks, agents, commands) via git with zero npm, the packs and forge ride the same
channel, and an npm publish adds an org, release automation, and a second drifting distribution
path for a CLI that consumers do not actually need — they need the plugin, which the marketplace
delivers. The per-project config wiring the CLI does is a maintainer/scaffolding concern, not a
runtime dependency of a consumer that has installed the plugin.

Why: assuming one distribution channel and making every surface tell the same story removes the
single worst onboarding failure (install the plugin, run `/void-doctor`, get a 404). It also
matches the already-recorded stance of the #68 entry above ("the CLI is distributed via the
marketplace (git), not an npm install"). This entry makes that stance explicit and repo-wide, and
resolves friction `2026-06-18-cli-not-distributed-to-consumers`.
