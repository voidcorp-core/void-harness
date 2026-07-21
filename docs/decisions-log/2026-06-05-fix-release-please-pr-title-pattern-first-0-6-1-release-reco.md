---
date: 2026-06-05
title: "fix release-please PR title pattern (first 0.6.1 release recovered by hand)"
---

## 2026-06-05: fix release-please PR title pattern (first 0.6.1 release recovered by hand)

Context: the first automated release PR (#7) was titled `chore: release main` —
no version. On merge, release-please logged `pullRequestTitlePattern miss the
part of '${version}'` then `untagged, merged release PRs outstanding - aborting`,
so it created no `v0.6.1` tag and would block all future releases. Root cause: a
`component` set without an explicit title pattern produced a versionless title.

Decision: set `"pull-request-title-pattern": "chore: release ${version}"` and drop
the `component` (a single root package does not need one), so release PRs carry the
version and release-please can tag them on merge. Recovered the stuck 0.6.1 by
hand: tagged `v0.6.1` on the release commit, created the GitHub release, and
relabeled PR #7 `autorelease: tagged` so release-please stops aborting. This commit
is `ci:` so it does not itself trigger a new release.

Alternatives rejected:
- Squash-merge release PRs to force a conventional title: the title-pattern fix is
  the actual cause; merge method is orthogonal.
