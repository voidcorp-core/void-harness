# Worktree planning and recovery

The universal invariant lives in [PHILOSOPHY.md](PHILOSOPHY.md#git-worktree-placement-and-lifetime).
This document describes the executable v2 contract of `void-harness autopilot orchestrate`.
The CLI plans; the existing runtime observes Git and executes argv. No terminal,
editor or presentation adapter chooses a worktree location or authorizes removal.

## Prepare

Submit `void-harness autopilot orchestrate --json < prepare-observation.json`.
Version 1, missing fields and ambiguous observations are rejected with
`AUTOPILOT_CONTRACT`, migration guidance and no executable steps. A saved v1
assignment can supply an explicit ticket-to-branch binding; its relative path is
not silently converted into cleanup authority. No installed consumer is migrated
by building or publishing these sources.

Example for a new ticket (replace all values with observations of your repository):

```json
{
  "schemaVersion": 2,
  "action": "prepare",
  "runId": "run-a",
  "clusterId": "cluster-a",
  "base": {"branch": "main", "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
  "tickets": ["DEV-1"],
  "footprints": [{"id": "DEV-1", "areas": ["src/a"], "highRisk": false,
    "confidence": 1, "touchesMigration": false}],
  "clusterSize": 1,
  "planPath": "docs/plans/p.md",
  "specPath": "docs/specs/s.md",
  "ticketBranches": [{"ticketId": "DEV-1", "branch": "autopilot-worker/DEV-1"}],
  "worktrees": {
    "repository": {"name": "example", "root": "/projects/example"},
    "environment": {"home": "/home/operator"},
    "observedAt": "2026-09-16T12:00:00.000Z",
    "caseSensitive": true,
    "worktrees": [{"path": "/projects/example", "branch": "refs/heads/main",
      "headSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "exists": true,
      "main": true, "locked": false, "hasSubmodules": false, "dirty": false,
      "localData": "none"}],
    "branches": [{"branch": "refs/heads/main", "headSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],
    "destinations": [{
      "path": "/home/operator/.local/share/git-worktrees/example/autopilot-worker/DEV-1",
      "canonicalPath": "/home/operator/.local/share/git-worktrees/example/autopilot-worker/DEV-1",
      "exists": false
    }],
    "temporaryRoots": ["/tmp", "/var/tmp"]
  }
}
```

`sequentialOwnership` and `minConfidence` retain their existing optional meanings.
Bindings name every ticket exactly once. For a resumed ticket use its saved
branch, including a legacy `autopilot-worker/<old-cluster>/<ticket>` or a Unicode
branch observed in Git. Never discover ownership by suffix matching. Preserve
that branch and its HEAD; do not create a replacement to make a naming rule fit.

## Observe at the boundary

| Field | Observation |
| --- | --- |
| repository | Canonical main-checkout root from Git, and explicit repository name as one safe path segment. |
| environment | HOME plus optional XDG_DATA_HOME and VOID_WORKTREES, called home/xdgDataHome/voidWorktrees. Empty optional values act unset. Only the selected override/fallback is validated. |
| worktrees | Complete `git worktree list --porcelain -z`, plus physical existence, actual HEAD, lock, main/submodule, dirty and local-data facts. Detached entries omit branch. Missing directories may omit HEAD. Never invent false for an unknown fact. |
| branches | Full local refs and HEADs from `git for-each-ref refs/heads`; preserve Git ref spelling. |
| destinations | Each computed target, its physical canonical location, and existence. Canonicalize the nearest existing ancestor and append the missing suffix. Observe aliases and symlinks before planning. |
| temporaryRoots | Actual system temporary roots and their physical aliases. |
| caseSensitive | Observed filesystem path semantics, not a guess from the operating-system name. Unrelated case-distinct Git refs do not create a global refusal. |
| observedAt | Timestamp of this observation, obtained at the I/O boundary. |

Selected locations must be absolute, durable and external even when explicitly
overridden. Windows drive/UNC and separator semantics are preserved; Git branch
slashes become path segments. Refuse path traversal, physical aliases into the
repository or temporary storage, occupied destinations and effective collisions.
An unused relative XDG fallback does not invalidate a valid VOID_WORKTREES root.

`localData` is `none`, `preserve` or `archived`. Git-clean is not evidence that
ignored local files are disposable. Inspect useful evidence, local journals and
other irreplaceable ignored files before recording `none`. `preserve` retains the
checkout. `archived` means the operator explicitly copied the useful data elsewhere
and verified the copy, including useful ignored files, before asking for removal.
The CLI does not archive, delete ignored data recursively, or clean global caches.
Regenerable files are distinct from useful evidence and uncommitted work.
For a missing directory, inspect the registration's recoverable Git metadata too
(index/staged state, HEAD and local recovery evidence). Missing directory is not
proof of no data: use `preserve` unless that inspection establishes `none` or an
explicit verified recovery copy establishes `archived`. Do not infer clean state
from an unavailable checkout.

## Execute and resume

Output schemaVersion is 2. Assignment `worktreePath` is an absolute physical
path. `setup` and `teardown` contain argv arrays, while `dispositions` always names
ticket, branch, path, state, reason and nextAction, including when both arrays
are empty. Preparation never emits removal authority. Preparation also returns
`prepareInput`, the complete validated original request, including footprints,
sequentialOwnership and minConfidence. To confirm setup, resubmit that input with
only the worktrees observations refreshed. The workflow rejects changes to lanes,
order, concurrency, pinned base or normalized footprints before launching workers;
it retains the original scheduling decision after successful confirmation.

- New checkout: planned-create, `git worktree add -b` from the pinned base.
- Existing branch without checkout: planned-create, add without `-b` or reset.
- Registered canonical checkout: reuse; no command and no content change.
- Registered old location: planned-move; an explicit Node filesystem argv creates
  missing parents after checking the observed physical ancestor, followed by
  `git worktree move`. No recreation or fallback replaces the checkout.
- Disappeared registration: prune only if every missing registration in the complete
  inventory is owned, eligible and has no dirty or unrecovered local/admin data.
  Foreign, excluded, held or unsupported registrations prevent automatic global prune.
  Otherwise preserve registrations and recover their state before replanning.
  After a permitted prune, obtain fresh complete inventory before any other operation.
- Main, locked, submodule or occupied move: refusal, preserved original location,
  no unlock, recreate or force fallback.

Pass each argv array directly to a process API with `shell:false`. A JSON rendering
preserves spaces, quotes and shell metacharacters; joining argv into shell text does
not. Human command displays, including cleanup, show JSON argv as planned and not executed; they are not execution evidence.

Stop at the first setup failure and launch no worker until all assignments are
confirmed from a fresh inventory. An interruption preserves completed moves/adds
and untouched checkouts. Replan from actual Git: completed assignments become
reuse. Empty reuse/no-op lists skip the executor; they do not grant permission to
invent a command. The workflow returns locations to resume after rejection or a
publication that has not merged.

## Cleanup after a later human merge

The original run may have ended. Save its v2 orchestration output and verified
reconciliation artifacts. After observing the actual merge, collect a new inventory
and submit a separate cleanup request to the same command. A merge grant or an
open PR is not merge evidence.

The cleanup request has exactly these fields:

- schemaVersion: 2; action: cleanup; plan: the saved v2 owned assignment plan.
- integration: `{sha, included: [{ticketId, headSha}], excludedTicketIds}` from
  the verified integration and its reconciled ranges, not unrelated current tips.
- merge: `{integrationSha, mergeSha, ticketIds, observedAt}` from the observed
  merge of that same integration. ticketIds equals the included ticket set.
- worktrees: a complete fresh observation read after merge.observedAt.
- retainedTicketIds: explicit additional owned holds, possibly empty.

Example assembling real saved and freshly observed artifacts:

```sh
jq -n --slurpfile prepared orchestration-v2.json \
  --slurpfile integration integration-observation.json \
  --slurpfile merged merge-observation.json \
  --slurpfile inventory worktree-observation.json \
  '{schemaVersion: 2, action: "cleanup", plan: $prepared[0].plan,
    integration: $integration[0], merge: $merged[0], worktrees: $inventory[0],
    retainedTicketIds: []}' > cleanup-observation.json
void-harness autopilot orchestrate --json < cleanup-observation.json
```

Owned, reconciled included and evidenced merged ticket IDs must agree. Foreign,
duplicate, stale or mismatched evidence rejects without executable output. Excluded
and held tickets remain. A changed HEAD, dirty tree, unpreserved useful local data,
lock, unsupported checkout or changed location also retains that checkout with its
reason and next safe action. Only matching clean merged worktrees get an unforced
`git worktree remove`. Git remains the final check if the tree becomes dirty after
observation. Branches are never deleted.

Removal already completed: already-absent, no-op. Missing directory still registered:
apply the same global-prune eligibility check above, then re-observe. The workflow
re-observes after actual execution and requires exactly one disposition per original
owned ticket with its matching branch and path before claiming completion. Empty,
partial, duplicate or foreign confirmation retains the cleanup status and requests
fresh inventory. Cleanup failure is reported alongside the successful merge; it never
changes an observed merge into a failed merge. Dispositions distinguish planned
operations from observed absence and retained work, and give an actionable path.

The pure planner validates supplied observations; it does not independently attest
an external observer. Callers must obtain facts from Git and the merge provider in
the documented order, not manufacture a recent timestamp for stale observations.

## Verification and storage

Real Git tests create only synthetic, uniquely owned fixtures under durable user
data storage, record HEAD/index/staged/unstaged/untracked-byte proof, then remove
those fixtures after saving evidence. This explicit test teardown does not authorize
cleanup of development worktrees, useful local evidence or shared caches. Session
and display resource closure never triggers Git removal or global pruning; see
[NATIVE-SUPERVISION.md](NATIVE-SUPERVISION.md).

Sources: [Git worktree](https://git-scm.com/docs/git-worktree),
[Git reference validation](https://git-scm.com/docs/git-check-ref-format), and
[XDG base directories](https://specifications.freedesktop.org/basedir/latest/).
