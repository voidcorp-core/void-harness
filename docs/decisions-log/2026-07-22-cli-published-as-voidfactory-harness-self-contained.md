---
date: 2026-07-22
title: "the CLI publishes as @voidfactory/harness, self-contained (bundled kernel); command stays void-harness"
---

## 2026-07-22: the CLI publishes as @voidfactory/harness, self-contained (bundled kernel); command stays void-harness

The npm scope `@voidcorp` is not available, so the public CLI publishes under **`@voidfactory/harness`**
(the 2026-07-21 public-MIT decision assumed `@voidcorp/harness`; this refines the name only). The
installed **command stays `void-harness`** — the `bin` name is independent of the npm scope, so
`npx @voidfactory/harness init` and the installed `void-harness` are the same tool.

**Only the CLI is published, and it is self-contained.** The CLI depended on the workspace package
`@voidcorp/harness-graph` at runtime; rather than rename the kernel's ~130 references to a new scope,
tsup now **bundles the kernel into the CLI** (`noExternal: ['@voidcorp/harness-graph']`), so the
published `@voidfactory/harness` has no internal-scope dependency — one atomic npm artifact. The
kernel's only runtime dep, `yaml`, is a normal public package declared in the CLI's `dependencies`
(Node handles its CommonJS interop; bundling it broke on a dynamic `require`). `@voidcorp/harness-graph`
moves to `devDependencies` (needed at build to bundle, never at runtime). The `release` script
publishes only `@voidfactory/harness`; the kernel, packs, and apps stay workspace-internal /
marketplace, unpublished.

The credible alternatives were rejected:
- **Rename the whole `@voidcorp` scope to `@voidfactory`** (~350 refs across kernel, packs, apps,
  docs, history): far larger surface for no functional gain — nothing but the CLI needs to be on npm
  for the public flow (packs ship via the marketplace). Minimal change was an explicit goal.
- **Publish the kernel separately as `@voidfactory/harness-graph`**: forces a consumer to resolve two
  packages and versions them apart; a single self-contained CLI is cleaner and atomically versioned.

**Accepted (conscious):** the published `package.json` retains `@voidcorp/harness-graph` in
`devDependencies` (rewritten by pnpm to a concrete `0.17.0` pointing at a package never pushed to
npm). It is needed in the workspace for tsup to bundle the kernel at build time; it is inert for every
consumer path (npm never installs a package's devDependencies transitively — verified: a fresh install
pulls only `@clack/prompts`, `yaml`, `zod`). The only way to hit it is `npm install` *inside the
extracted tarball* (SBOM tooling, clone-and-poke), which would `E404` loudly, not silently. Stripping
it would require a fragile prepack manipulation; the harmless, standard metadata is preferred over that
fragility.

The GitHub org (`voidcorp-core`) and the Claude Code plugin naming (`@voidcorp/harness-nextjs`, the
optional secondary marketplace channel) are deliberately **unchanged** — renaming the org is an
external repo-transfer op, and the marketplace naming couples to a separate repo; neither blocks the
npm publish.

Why: this ships the account-free `npx @voidfactory/harness` install with the smallest possible change
to the repo and zero change to GitHub, while keeping the published artifact clean and self-contained.
Validated end-to-end, not just configured: `npm pack` → install the tarball in a clean directory →
`void-harness status` renders correctly from the bundled certification + model, with no monorepo and
no internal-scope dependency.
