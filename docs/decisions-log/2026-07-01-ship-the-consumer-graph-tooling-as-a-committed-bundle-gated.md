---
date: 2026-07-01
title: "ship the consumer graph tooling as a committed bundle, gated on the embedded model (sub-project B)"
---

## 2026-07-01: ship the consumer graph tooling as a committed bundle, gated on the embedded model (sub-project B)

Context: the graph tooling (kernel, `graph` CLI, studio) ran only in the monorepo.
Consumers of the harness get their assets from the marketplace (`voidcorp-core/void-plugins`),
which pins a repo SHA and fetches `packages/core` directly — there is no npm publish
(deliberate) and no out-of-repo asset channel. To let a consumer run `graph cost`/`live`
against their own project, the tooling has to reach them through the plugin assets.

Decision: build one self-contained `packages/core/graph/void-graph.mjs` (esbuild bundles the
kernel + CLI, the model.json is baked via a `__VOID_BUNDLED_MODEL__` define, the single-file
vite studio is inlined via `__VOID_BUNDLED_STUDIO__`) and **commit it** so the marketplace ships
it. On the consumer it runs 100% local (served on `localhost`, offline), filtered to the packs
enabled in `.claude/settings.json`. It is invoked by the `/void-graph` command.

Two credible alternatives were rejected. (1) Publish the CLI to npm — rejected: the zero-npm
policy stands, and it would not reach marketplace-only consumers anyway. (2) Host the studio at a
public URL and ship only a data server — rejected: it adds a network dependency and a
mixed-content (https page → http localhost) problem, breaking the offline guarantee.

The freshness gate is the **embedded model**, not the whole artifact. `graph check-bundle`
compares the sha256 of the model baked into the committed `.mjs` (self-reported by
`graph model-hash`) against the committed `model.json`. Byte-comparing the full vite/esbuild
output was rejected as the gate: its determinism across environments (rollup chunking, bundler
versions) is not guaranteed, so it would flap; the model is the part that actually drifts when
skills/hooks/commands change. The artifact is excluded from the npm CLI's `core-assets` mirror
(consumers get it via the marketplace, not the unpublished tarball) to avoid doubling the blob.

Why: committing a ~1.9MB build artifact into git is a real cost (blob growth per release), taken
knowingly because it is the only path compatible with zero-npm + marketplace-ships-repo. The
cost is bounded by refreshing the artifact only when `model.json` changes (a skill/hook/command
add or remove), enforced by the per-PR `graph:check-bundle` gate — the same "regenerate the
derived asset, fail on drift" pattern the repo already uses for `core-assets` and `model.json`.
