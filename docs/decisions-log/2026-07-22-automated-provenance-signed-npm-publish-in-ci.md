---
date: 2026-07-22
title: "npm publish is automated in CI, provenance-signed, gated on the release-PR merge"
---

## 2026-07-22: npm publish is automated in CI, provenance-signed, gated on the release-PR merge

Context: `@voidfactory/harness` was version-managed by release-please but **published by hand**
(`pnpm release` from a laptop). The publish-readiness audit flagged two consequences: (1) no npm
**provenance** — an attestation that the tarball was built from a specific commit in a verifiable
CI run can only be minted from CI via OIDC, never from a laptop; for a public package installed
account-free by strangers, that is a real trust signal; (2) supply-chain surface — a long-lived
token on a dev machine and a `dist/` whose freshness rests on the maintainer remembering to rebuild.

Decision: publishing happens **only in CI**, in `.github/workflows/release.yml`'s `publish` job,
gated on `needs.release-please.outputs.release_created == 'true'` — i.e. it fires exactly when a
human merges the release-please PR. That merge is the single HITL gate; there is no separate
"publish" button and no supported manual `npm publish`. The job runs under `id-token: write`,
executes `pnpm check:publish` (fails closed if any `workspace:` specifier survived a packed
tarball), then `pnpm --filter @voidfactory/harness publish` with `NPM_CONFIG_PROVENANCE=true`.

Why this shape:
- **HITL = merging the release PR, not a second button.** The repo's doctrine is "every release is
  a deliberate human act." Merging the version-bump/changelog PR already IS that act; adding a
  separate manual publish step would be ceremony without added control. Publishing on *every* push
  would remove the gate entirely — rejected.
- **CI-only publish makes the `workspace:` footgun structurally impossible.** `pnpm publish`
  rewrites `workspace:*` to a real range; a manual `npm publish` does not and can ship a broken
  manifest. Removing the human from the publish path means the rewrite + the `check:publish` guard
  are *always* applied — the pérenne fix, not a "remember to use pnpm" convention.
- **Provenance now, Trusted Publishing later.** The first publish needs a token
  (`NPM_TOKEN`, a granular automation token scoped to the package). Once the package exists on npm,
  this can be upgraded to tokenless **Trusted Publishing** (OIDC, configured npm-side), eliminating
  the stored token. Deferred because it requires the package to already be published.

Rejected alternatives: (a) keep manual `pnpm release` — no provenance, laptop-token risk, and the
`workspace:` guard only *detects* a bad manual publish, it can't prevent one; (b) publish on every
push to main — no human gate, violates the release-is-deliberate doctrine; (c) drop
`@voidcorp/harness-graph` from devDependencies to avoid the `workspace:` rewrite entirely —
rejected: it is a build-time (tsup-inlined) dependency pnpm must link, so removing it risks
breaking the bundle build; the CI + pnpm-publish path handles the rewrite deterministically.
The manual `pnpm release` script stays only as an emergency fallback, documented as non-standard.
