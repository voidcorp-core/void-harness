# gh fixtures

Real outputs, captured read-only on 2026-09-22 with gh 2.100.0. Tests derive
variants from them by overriding fields; no shape here was written by hand.

| File | Source |
| --- | --- |
| `pr-view-open.json` | `gh pr view 381 --json number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,autoMergeRequest,statusCheckRollup` (this repository) |
| `pr-view-merged.json` | same fields, PR 395 (this repository) |
| `pr-view-auto-merge.json` | same fields, PR 379 (this repository): an armed `autoMergeRequest`, a failed and a skipped check run |
| `pr-view-comments.json` | `gh pr view 378 --json comments` (this repository); tests add it to the views above, as gh prints both when both are requested |
| `check-run-queued.json` | one `statusCheckRollup` entry of zed-industries/zed PR 64608: a check run not yet completed |
| `status-contexts.json` | two `statusCheckRollup` entries of kubernetes/kubernetes PR 142315: commit statuses, the shape `void/independent-review` takes |
| `queue-absent.json` | `gh api graphql` `repository.mergeQueue(branch: "develop")` on this repository |
| `queue-present.json` | the same query on zed-industries/zed `main` |
| `pr-commits-review-status.json` | `gh api graphql` `pullRequest.commits(last: 100) { commit { oid status { context(name: "EasyCLA") { state } } } }` of kubernetes/kubernetes PR 142273: statuses per commit, null where a commit has none |
| `timeline-*.json` | `gh api graphql` `pullRequest.timelineItems` (merge queue events and commits) of zed PRs 64552 and 64434 |

No pull request of this repository carries a commit status, and this repository
has no merge queue yet, hence the two public sources.
