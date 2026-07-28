---
schemaVersion: 1
id: "adr:077c5419-ffe2-454f-a50e-9c147cf15ce9"
createdAt: "2026-07-25T08:25:35.923Z"
title: "Autopilot owns autonomous ticket clusters and stops at human PR merge"
status: accepted
deciders: ["Folpe"]
supersedes: ["legacy:2026-06-21-consolidate-backlog-skills-into-backlog-autopilot-in-session","legacy:2026-06-21-auto-merge-is-risk-gated-and-sequential-not-a-deterministic","legacy:2026-06-26-backlog-autopilot-auto-merge-method-configurable-default-mer"]
---

# Autopilot owns autonomous ticket clusters and stops at human PR merge

## Context

`backlog-autopilot` inherited two incompatible interaction models: an attended
batch that asks for confirmation before fanout, and a future long-running
orchestrator expected to make progress without repeated prompts. Consumer
projects also need the active program and Linear tracker to survive session
boundaries. Opening or pushing one branch per ticket multiplies remote CI cost,
while duplicating `ticket-runner` inside an orchestrator would create two quality
cycles that inevitably drift.

The previous decisions chose an in-session orchestrator, worktree isolation and
risk-gated auto-merge. The desired boundary is now clearer: one durable opt-in,
autonomous decisions and reconciliation, then an explicit human merge.

## Decision

Rename the public capability to `autopilot`; make project activation durable;
run the canonical `ticket-runner` once per ticket in clusters initially capped
at four; reconcile their commit ranges into one integration PR; and reserve the
only nominal human gate for merging that PR.

Autopilot may apply safe migrations to dev/local and resolve ordinary ticket or
integration decisions using ticket, plan, doctrine and repo conventions. It
must not weaken security, expand scope materially or perform irreversible
production actions without new authority. Those cases block only the affected
ticket when the rest of the cluster is independent.

Linear owns mutable ticket state, GitHub owns PR/check state, Git owns commits,
and `.void/autopilot` is a recoverable technical cursor. The old
`backlog-autopilot` surface becomes an actionable migration error, not a second
implementation.

## Consequences

Positive:

- A new session can resume automatically without asking the user to restate the
  tracker, global plan or autonomy request.
- Per-ticket commit ranges retain TDD and review history while one
  reconciliation PR amortizes remote CI.
- `ticket-runner` remains the single source of truth for ticket quality.
- Reconciliation, rebase and CI fixes have one owner; merge authority stays
  visibly human.

Negative:

- A cluster can wait at the PR gate even when every automated proof is green.
- Local verification must mirror CI closely; environment-only failures can
  still require an additional remote run.
- Durable activation and cross-system recovery add state-machine and connector
  tests.
- Renaming the public command requires a migration window and documentation
  update across both runtimes.

## Alternatives considered

- Keep `backlog-autopilot`: rejected because the name encodes an implementation
  detail and undersells the intended project-level autonomy.
- Add a `ticket-worker` cycle inside Autopilot: rejected because it overlaps
  `ticket-runner` and would create two definitions of ready-to-ship.
- Open one PR per ticket: rejected because it duplicates CI and moves
  reconciliation cost to the human.
- Auto-merge low-risk clusters: deferred because the requested trust boundary is
  the human merge; branch protection proves checks, not product judgment.
- Ask before every cluster: rejected because project activation is already an
  explicit, durable consent and repeated prompts break automatic resume.

## Reversal cost

Medium. The command can be renamed again and the cluster cap is configuration,
but consumers will depend on the durable activation and single-PR lifecycle.
Changing the merge boundary later requires a new decision that supersedes this
record.
