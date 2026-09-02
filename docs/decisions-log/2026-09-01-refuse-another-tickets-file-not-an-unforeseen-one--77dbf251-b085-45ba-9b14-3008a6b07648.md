---
schemaVersion: 1
id: "adr:77dbf251-b085-45ba-9b14-3008a6b07648"
createdAt: "2026-09-01T15:16:16.413Z"
title: "a range is refused for another ticket's file, not for an unforeseen one"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# a range is refused for another ticket's file, not for an unforeseen one

## Context

On 2026-09-01, during the first real `void-autopilot` run, two workers in two worktrees each ran
`git stash push` to split a commit. `git worktree` isolates the working tree, the index and
`HEAD`; it does not isolate the repository's refs, and `refs/stash` is one stack for the whole
repository. The second `pop` took the first worker's entry, and each worker ended up holding the
other ticket's files in its own worktree.

Both got out of it, and reconciliation proved afterwards that the two ranges were clean. Nothing
guaranteed that. Had one worker staged before noticing the swap, the other ticket's files would
have entered its commit, under a message that never mentions them, on a branch claiming a disjoint
footprint. The merge would have succeeded without a conflict precisely because the footprints were
disjoint, and unclaimed code would have reached the integration pull request.

Ancestry verification does not see it: it proves a range is the linear history it says it is, not
whose files are inside it. So reconciliation needs a second question -- does this range carry only
what its ticket was entitled to write -- and that question needs a rule for what "entitled" means.

The rule is the hard part, and one obvious form of it is a trap. In the same run, DEV-526 widened
its footprint from three files to six: enumerating from the package manifests revealed three more
packages with the identical defect. That widening was the ticket done properly. A check that
refuses any file the ticket did not predict would have refused it, and the fix a guard makes
awkward is the fix that gets narrowed until the defect survives -- which is how the original
defect stayed hidden in the first place.

## Decision

The reconciliation footprint audit refuses a range for a file **another ticket of the cluster
declared**, and never for a file merely nobody predicted; a file nobody claimed is reported as a
widening and integrates.

Four clauses follow from it. A file the range's own ticket declared is in scope. A file two
tickets both declared is in scope for both, because `orderWorkers` already sequenced them for that
exact collision, so refusing it here would refuse a conflict the ordering step resolved. A
`reconcileOnly` path is not judged at all, since the reconciler strips it from every range and
rebuilds it once. And the audit reads `git diff --name-only base..head`, never the worker's own
`files` list: a claim cannot clear a range of carrying somebody else's work, so a range git was
never read for is excluded as `footprint-unobserved` rather than trusted.

The declared footprints are the cluster's, not the run's: a ticket that was blocked, excluded or
never spawned still holds its claim. What makes a file foreign is that somebody else declared it,
not that somebody else also touched it.

## Consequences

Positive:

- The failure mode that motivated the ticket -- unclaimed code entering an integration pull
  request through a merge that cannot conflict -- is refused at the boundary, with the offending
  files and their claimant named.
- Legitimate discovery is untouched. A worker that finds three more packages with the same defect
  integrates, and the growth is reported rather than punished.
- The audit consumes what the planner already produces (`footprints[].areas`), so no new input has
  to be authored for a cluster to be protected.

Negative:

- Contamination between a cluster ticket and a file nobody declared is invisible to this check.
  That is the deliberate hole: the alternative closes it by refusing discovery, which costs more.
- Footprint quality now has a second consumer. A ticket that declares a whole directory claims
  everything under it, and a neighbouring ticket that legitimately edits one file there is refused
  until a human re-reads the declarations. This is the clause a reviewer should push back on, and
  the honest answer is that the refusal is loud, names the claimant, and preserves every branch --
  it costs a re-run, not work.
- Two more exclusion reasons on the reconcile plan, and a cluster whose planner emits no footprint
  at all silently gets no audit.

## Alternatives considered

- **Refuse any file outside the range's own declaration.** Strictly safer, and the reason it is
  rejected is measured rather than theoretical: it would have refused DEV-526's correct widening
  on the very run that motivated this decision. A guard whose first true positive is a false one
  gets an exclusion written into it, and an exclusion written into a brand-new guard is what hid
  the original defect.
- **Refuse only a file another ticket's range actually touched.** Cheap, and wrong in the case
  that matters most: the contaminated worker is often the one whose neighbour was blocked, or
  whose neighbour's stash it absorbed before that neighbour committed anything. Ownership is a
  claim, not an observation of a branch.
- **Audit inside the worker, at commit time.** Closer to the mistake and would fail faster, but a
  worker auditing itself is the party with both the incentive and the confusion; the guard belongs
  where the code enters shared history, which is reconciliation.
- **Give each worker its own clone rather than a worktree.** Removes the shared ref stack
  entirely, at the cost of a full checkout and a full install per ticket. Rejected in the ticket's
  own scope: the prohibition solves it, disk and install time do not come back.

## Reversal cost

Low. The audit is one pure module consumed at one call site, gated on `footprints` being present
in the reconcile observation. Tightening the rule, loosening it, or removing it changes that
module and its tests; nothing durable is written in its shape, and no artefact records its
verdicts.
