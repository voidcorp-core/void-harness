---
title: Seven-ticket delivery explicitly requested by Folpe
date: 2026-09-16
status: approved
ticket: DEV-844
---

# Approved scope

After the two corrective PRs were merged, Folpe requested a new ticket based on
the test-cost audit and implementation of the six tickets just proposed, each by
its own agent following void-implement and reporting to the coordinator.
The new DEV-844 starts first. The complete pool is DEV-844, DEV-531, DEV-611,
DEV-630, DEV-682, DEV-662 and DEV-635. This is an explicit scope change from the
earlier six-ticket programme, not automatic backlog selection.

DEV-844 follows its [specific spec](2026-09-16-test-cost-optimization.md).
DEV-531/611/630/682 retain the previously approved contracts in the
[earlier spec](2026-09-15-approved-six-ticket-cluster.md); DEV-610/645 are Done.
DEV-662 preserves its measured cold-start budgets and forbids daemons or weaker
gates. DEV-635 establishes the real shell needs of each named agent before
aligning permissions and the read-only claim. Missing load-bearing decisions
must be resolved from evidence rather than guessed into implementation.

The user asked for parallel agents. The native runtime supports three subagents
at once; the coordinator uses waves, reserving review capacity. Worktree isolation
does not justify overlapping shared code ownership or concurrent heavy checks.
Preserve unfinished work, failed observations and canonical certification limits.
No new permission to promote main, publish npm or alter consumer installations is
implied. Deliver reviewed, verified implementation and an integration PR.

Execution boundaries and gates: [coordination plan](../plans/2026-09-16-seven-ticket-delivery.md).
