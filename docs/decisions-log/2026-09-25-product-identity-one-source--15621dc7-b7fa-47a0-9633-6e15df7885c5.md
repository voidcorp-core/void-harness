---
schemaVersion: 1
id: "adr:15621dc7-b7fa-47a0-9633-6e15df7885c5"
createdAt: "2026-09-25T09:21:51.060Z"
title: "The product identity has one source; workflow guards keep a literal the contract test holds to it"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The product identity has one source; workflow guards keep a literal the contract test holds to it

## Context

The repository is renamed from `voidcorp-core/void-harness` to `voidcorp-core/void-machine`, the
npm package from `voidharness` to `voidmachine`, and the command from `void-harness` to
`void-machine` (alias `vm`, `void-harness` deprecated). The old names were written in 87 files,
among them security guards: the promotion, back-merge, release and enforcement workflows refuse
any repository but this one, the release provenance contract requires the package name and the
repository, and the review exemption of the back-merge compares a slug. Each copy was a constant of
its own file, so a rename meant finding every one, and missing one either broke a guard or left it
comparing against a name nobody uses any more.

## Decision

The identity lives in `packages/core/data/identity.json`: owner, repository name and the names it
carried before, package name and the former packages with their last major, primary command,
aliases and deprecated commands. TypeScript reads it through `PRODUCT_IDENTITY` in
`@voidcorp/hook-runner`, bundled into the CLI and the hook runtime; plain-ESM scripts read it
through `scripts/product-identity.mjs`, resolved relative to the script file.

Workflow guards keep a literal (`EXPECTED_REPOSITORY`, `EXPECTED_OWNER`, `EXPECTED_NAME`,
`EXPECTED_PACKAGE`), and `test/identity/product-identity.test.ts` fails when one differs from the
source, when a workflow names another repository of the owner, or spells the package name outside
`EXPECTED_PACKAGE`. The same test holds npm and plugin manifests to the source, forbids the slug
and the package name in code, and confines former names to the historical record.

## Consequences

Positive:

- A future rename edits one file, then the manifests and workflows the contract test names; no
  guard can silently keep the old value.
- A guard still decides before any checkout, from the workflow file of the protected branch. A
  fork copying the file, identity included, compares its own `github.repository` against a slug it
  does not own, and fails exactly as before.
- Messages that tell a user to run an old release name the package that release was published
  under (`packageFor`), so a 3.x project is never told to fetch `voidmachine@3.x`, which will
  never exist.

Negative:

- The workflows still repeat the values; the protection is a test, not an import.
- A job that sparse-checks-out a script must also list `scripts/product-identity.mjs` and
  `identity.json`. `test/workflows/sparse-checkout-closure.test.ts` enforces it; without it the
  review job would crash in CI only, and every merge would wait for a verdict never posted.
- GitHub redirects git and web traffic after a rename, never a workflow's `uses:`: consumers
  calling the reusable `enforce.yml` by the former slug break at the rename. `doctor` now reports
  that reference as broken, but it cannot repair a consumer it does not run in.

## Alternatives considered

- Have each workflow read `identity.json` from a trusted checkout and compare
  `github.repository` to it: equally safe, since the checkout is the protected branch, but every
  guard would move after a checkout and a Node step, including the ones that today refuse before
  any token is minted, for a value that changes once in the product's life.
- Keep one constant per consumer and rely on search at rename time: how 87 copies came to exist.
- Add markers and an environment-variable prefix to the source now: they are part of the brand
  migration (DEV-911), and nothing in this change reads them.

## Reversal cost

Low. The source can be inlined back into each consumer; the contract test is deleted with it.
Renaming the repository back is a GitHub operation plus one edit to the source.
