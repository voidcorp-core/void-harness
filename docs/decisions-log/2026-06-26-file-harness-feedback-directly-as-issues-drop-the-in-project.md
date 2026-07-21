---
date: 2026-06-26
title: "file harness feedback directly as issues, drop the in-project `proposed/` queue (issue #35)"
---

## 2026-06-26: file harness feedback directly as issues, drop the in-project `proposed/` queue (issue #35)

Context: `harness-evolution` (feedback mode) captured a perceived harness gap to
`.void/harness-feedback/proposed/YYYY-MM-DD-N.md` **inside the consumer project
repo**, then required a second step (`void-harness feedback push`, shipped
2026-06-19, cluster C) to walk the queue and file each note as a GitHub issue on
this repo. This put harness concerns in the wrong repo's git history and
duplicated a triage system that already exists: the GitHub issue tracker. A
per-repo markdown queue is a strictly worse reimplementation of an issue tracker
(no labels, no cross-project visibility, buried in each consumer's `.void/`).

Decision: replace the queue with **direct issue creation** on
`voidcorp-core/void-harness`.
- The skill / `/void-feedback` command drafts an issue, confirms it with the
  user, then opens it with `gh issue create` (label `enhancement`), carrying
  source-project context (repo, SHA, file path, motivation).
- The tracker is the triage zone: taking the issue promotes it, closing it
  declines it. No `proposed/` / `promoted/` / `discarded/` / `deferred/`
  bookkeeping, no `feedback push` step.
- Removed: the `feedback` CLI command (`packages/cli/src/commands/feedback.ts`),
  its pure builders (`lib/feedback.ts` + test), the `HARNESS_REPO` const (its
  only consumer), the help entry, and the `.void/harness-feedback/proposed/`
  convention from the skill and docs.

Why this preserves HITL: an issue is a proposal, not a doctrine write. HITL is
about not auto-MERGING a PR, not about not opening an issue, so creating the
issue directly does not weaken the gate. This reverses the 2026-06-19 decision to
*implement* `feedback push`: that command made the then-documented two-step real,
but the two-step itself was the misplaced ceremony.

The one caveat (deliberate discipline shift): the queue's only real value was a
pre-filter against noise in this tracker. Going direct moves that filter from
"before the issue exists" to "triage by close". Cheap for a single-maintainer
repo, but it makes the agent's **filing bar load-bearing**: file only when the
item is both *agnostic* (helps any consumer) and *harness-worthy* (changes a
skill / hook / pack / CLI / doctrine line); project-specific rules go to
`.void/PROJECT-DOCTRINE.md` via `capture-rule`. The reference bar is the #34 ADR
sweep, which rejected everything except one narrow correction. The skill codifies
this bar so the tracker does not fill with project-flavored noise.

Source: maintainer direction while auditing a consumer project (sesame).
