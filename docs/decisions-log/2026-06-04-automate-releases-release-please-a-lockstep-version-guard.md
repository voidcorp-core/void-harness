---
date: 2026-06-04
title: "automate releases (release-please) + a lockstep version guard"
---

## 2026-06-04: automate releases (release-please) + a lockstep version guard

Context: the 0.6.0 bump was manual (`pnpm bump` + asking). Hand-bumping a version
is a process smell and an obvious drift source — exactly the rules-rot pattern
this repo keeps eliminating.

Decision: adopt **release-please**, driven by the Conventional Commits the repo
already enforces. A workflow maintains a single release PR that bumps the
canonical version across every manifest (via `extra-files` — the same file list
as `bump-version.mjs`, plus the core-assets mirror) and writes CHANGELOG.md;
merging the release PR tags `vX.Y.Z` and cuts a GitHub release. The version is
computed automatically; the merge is the only human gate (HITL preserved). Pre-1.0
policy: feat → minor, fix → patch, breaking → minor (`bump-minor-pre-major`). npm
publish is deliberately not wired yet (the package is unpublished).

Added a belt-and-suspenders **lockstep guard** (`scripts/check-version-lockstep.mjs`,
`pnpm version:check`, wired into CI): it fails the build if any version-carrying
file diverges from the canonical marketplace version — so a miss by release-please
(e.g. a bad jsonpath), the manual bumper, or a hand-edit is caught before it ships.
`bump-version.mjs` stays as the manual/offline fallback.

Alternatives rejected:
- **changesets**: per-package independent versions + per-package changelogs
  contradict the single-number lockstep; release-please fits Conventional Commits
  and lockstep better. (Same reason it was dropped in 0.5.4.)
- **Auto-tag/commit on every merge to main**: needs a privileged token to push to
  protected main and bot-commits per merge; the release-PR model is cleaner and
  keeps the human gate.
- **Bespoke release workflow around `bump-version.mjs`**: reimplements the
  release-PR + tag orchestration release-please already does robustly. Kept the
  script only as a fallback; the guard makes either path safe.

Caveat: the release workflow itself can only be validated on its first real run
(GitHub Actions). The load-bearing pieces are tested/guarded: the lockstep check
(unit-tested) and the bumper.
