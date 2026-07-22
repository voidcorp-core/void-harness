---
date: 2026-07-22
title: "the CLI npm package is renamed @voidfactory/harness -> voidharness (unscoped)"
---

## 2026-07-22: the CLI npm package is renamed @voidfactory/harness -> voidharness (unscoped)

The install entrypoint `npx @voidfactory/harness init` is long to type. The CLI
package is renamed to the unscoped **`voidharness`** (verified free on npm), so the
first contact becomes `npx voidharness init`. The binary keeps its descriptive name
`void-harness` and gains a short alias `vh` (a bin name is independent of the
squatted `vh` npm package).

The credible alternative was keeping the scoped `@voidfactory/harness` and only
shortening the *installed* usage (`vh init`). Rejected: for an account-free, viral
tool the friction that matters is the first `npx`, and only the package name
shortens that. `vh` and `harness` are both taken on npm; `voidharness` is the
shortest free, readable name.

Why now: the repo is not yet public and adoption is ~zero, so the rename breaks no
one. After a public launch with users it would be painful. The lost `@voidfactory`
scope is accepted — the brand is carried by the GitHub org (`voidcorp-core`), not
the npm scope.

**Operational consequence (one-time, maintainer):** npm Trusted Publishing and
provenance were configured for `@voidfactory/harness`. They must be reconfigured
for `voidharness`: bootstrap the first `voidharness` publish manually (2FA OTP,
as with the original 1.0.0), then set the Trusted Publisher on the `voidharness`
package (org `voidcorp-core`, repo `void-harness`, workflow `release.yml`). Until
that is done, the CI publish job will fail auth for the new name. `@voidfactory/harness`
1.2.0 stays on npm as a dead-end; a final deprecate-with-pointer is optional.
Supersedes 2026-07-22-cli-published-as-voidfactory-harness-self-contained on the
package name only (the self-contained-bundle decision is unchanged).
