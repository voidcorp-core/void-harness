# Release 4.0.0 stabilization plan

The continuous loop merges into `develop` on its own, and its review now runs
as a GitHub App whose check nothing a worker runs can post (proved on #409, 25
September 2026). What remains before consumers get it is not features: it is
the plumbing between `develop`, `main` and npm, which the first real promotion
of that chain showed to be brittle. A release ships only once that plumbing
holds, so every consumer inherits a stable mechanism rather than a moving one.

## Units, in order

1. **DEV-905: back-merge on ancestry, not on equal trees.** After a promotion
   whose trees match, `back-merge.yml` skips, `main`'s merge commit never
   reaches `develop`, and the next promotion is out of date against a `main`
   that requires it up to date. Done when a promotion with identical trees is
   followed by a back-merge, and a proof in the test suite fails without it.
2. **DEV-908: rename the repository to `void-machine`.** The name is written
   into the guards of promotion, back-merge, enforcement and npm provenance,
   each of which refuses any other repository. Done when no occurrence of the
   old name remains outside the immutable decision log, a test fails on one,
   and the chain is green after the person renames the repository.
3. **DEV-909: publish 4.0.0 (human gate).** The person allows
   `pull_request_target` explicitly before GitHub blocks it by default on 2
   November 2026, merges the promotion, then the release pull request. Done
   when the package is published with verified provenance and a consumer
   installs it.
4. **DEV-902: delegated agents open in a pane.** Visibility, not delivery; it
   follows the release so it does not hold it.

## Verification gates

Each unit runs the complete `void-implement` cycle and the repository gates
(`pnpm test`, `derive:check`, `sync:docs`, `decisions check`, consumer
conformance). A unit touching `.github/**` or a script that judges a merge is
merged by a person, as the protected-paths floor requires.

## Resume point

The provider's state is the progress: resume the unit in progress, otherwise
take the first ready one in this order whose blockers are done.
