---
schemaVersion: 1
id: "adr:20ae0dfe-ba69-4981-8528-fd53034cc155"
createdAt: "2026-09-16T14:53:44.044Z"
title: "Worktree planning follows ticket identity and observed merge"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Worktree planning follows ticket identity and observed merge

## Context

The user approved durable external Git worktrees, reuse by branch and lifetime
owned by the ticket. The existing v1 planner emits repository-relative run-owned
paths, derives cluster-scoped branches and issues teardown before merge. Silently
reinterpreting that artifact would change the meaning of executable operations.

## Decision

Use explicit v2 prepare/cleanup observations through the existing orchestrate
command. Reject v1 or incomplete observations without executable output and with
migration guidance. Preserve explicit prior ticket-to-branch mappings, including
legacy branches, and output absolute physically observed destinations. Keep pure
planning separate from the existing runtime executor and physical observation.
Cleanup consumes fresh ticket-specific observed merge/integration evidence and
current inventory. It removes only eligible clean owned merged tickets; excluded,
unmerged, changed or useful-local-data-bearing checkouts remain. Failed cleanup
is reported separately from a successful merge. Presentation lifetime never
supplies cleanup authority. No automatic consumer migration or background service.

## Alternatives considered

- Silently convert v1: rejected because missing branch/physical/merge observations
  cannot be reconstructed from run-local paths without risking existing work.
- Keep run-owned checkout/teardown: conflicts with the approved durable ticket
  lifecycle and loses reuse after interruption or later human merge.
- New Git execution daemon: adds a second executor and unnecessary lifecycle state.

## Consequences

Executable callers and packaged examples must switch to v2 together. Existing
saved v1 artifacts require fresh observation and explicit prior bindings, never
forced recreation. This is a protocol migration, not an automatic filesystem move.
## Reversal cost

Medium. Reversal requires another explicit protocol change plus compatibility treatment
for saved v2 plans. It cannot safely restore unconditional run-end deletion.

This decision does not supersede the accepted runtime-state-from-worktree ADR:
its old location reference is historical, and repository-owned runtime evidence
remains a separate boundary. No accepted ADR is edited in place.
