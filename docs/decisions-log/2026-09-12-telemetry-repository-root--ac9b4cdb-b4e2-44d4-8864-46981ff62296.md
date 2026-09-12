---
schemaVersion: 1
id: "adr:ac9b4cdb-b4e2-44d4-8864-46981ff62296"
createdAt: "2026-09-12T17:03:53.249Z"
title: "Telemetry discovers its verified repository without spawn environment injection"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:5cb0bfd0-6327-4b12-9111-2f4afbcef6d4"]
---

# Telemetry discovers its verified repository without spawn environment injection

## Context

DEV-738 assumed native Codex spawning accepted an environment option. The actual
session tool schema accepts none. Without exported roots the old runtime-event
writer stores journals inside a disposable worktree. Its test required this
incorrect behavior, so syntax-level adapter tests did not prove the guarantee.
Folpe authorized correction of this incompatibility and autonomous delivery to
develop; production promotion remains human.

## Decision

Resolve the canonical telemetry destination through the shared project-root
boundary, while keeping policy and lifecycle evaluation in the worker tree.

The shared resolver moves into hook-runner, preserving CLI exports through a
thin delegate. Telemetry can discover nested and linked roots without injected
variables. An independent install receipt retains its own root. Existing explicit
root inputs remain compatible. A linked destination must be verified by Git;
unresolved identity is a refusal, not successful local fallback.

Ordinary main and standalone roots avoid Git subprocesses. Linked-root discovery
has a 100 ms aggregate deadline and is resolved once per hook invocation. Root
refusal and journal-write failure each produce a bounded, payload-free stderr
diagnostic. These advisory diagnostics never alter enforcement stdout or exit
status. Existing sequencing, correlation and write-integrity checks remain owners
of journal persistence.

## Consequences

Positive:

- Native workers do not require unavailable launch parameters.
- Canonical events survive worker disposal without moving policy evaluation.
- CLI and hook discovery share one implementation and compatibility tests.

Negative:

- Unknown or slow linked-root discovery refuses telemetry; it does not certify
  an autopilot run. Installed-hook conformance must prove the actual destination.
- Previously released hooks still need normal consumer adoption. Source builds
  never replace the active released safety floor to manufacture conformance.

## Alternatives considered

- Export a variable from the worker prompt: rejected because child shell changes
  cannot modify the runtime process that launches hooks.
- Add an unsupported spawn parameter: rejected by the observed native contract.
- Move all hook roots to the main checkout: rejected because it changes which
  project rules and sibling tests govern worker edits.
- Copy each journal at teardown: rejected because interruption would still lose
  data and introduce a second journal reconciliation mechanism.

## Reversal cost

Medium. The CLI boundary remains compatible, but removing root discovery would
require a different verified durable destination in every runtime adapter.

## References

- https://developers.openai.com/codex/subagents
- https://git-scm.com/docs/git-worktree#_porcelain_format
- https://git-scm.com/docs/git-rev-parse
- docs/plans/2026-09-12-worker-telemetry-roots.md
