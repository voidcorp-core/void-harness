---
schemaVersion: 1
id: "adr:e7cbb234-5f97-472b-a699-ba3f46c13248"
createdAt: "2026-07-24T16:41:00.617Z"
title: "Bind mission verdicts to fresh canonical evidence"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Bind mission verdicts to fresh canonical evidence

## Context

An exit code stored without its inputs can become a false green as soon as the
working tree changes. Mutable summary files also let a stale or duplicated proof
silently replace history. The solution must stay local, account-free,
runtime-agnostic and cheap enough for every mission while preserving a clear
boundary between evidence integrity and remote attestation.

## Decision

Derive mission verdicts deterministically from the canonical event journal.
Command evidence is bounded, redacted, canonicalized with recursively sorted JSON
keys and sealed with a SHA-256 self-hash before it becomes an
`evidence.recorded` event. It declares typed dependencies such as the current
Git diff; only dependencies whose current hash changed invalidate it.

Findings and their resolution or exception are also append-only events.
Non-waivable blockers ignore exception attempts. A verdict can be `verified`,
`shipped-with-exception`, `unverified`, `blocked` or `degraded`; gaps,
duplicates, malformed lines, cross-mission links and failed evidence integrity
can never promote it.

The self-hash is an integrity checksum, not a signature against a compromised
local user. Stronger CI or producer attestation must remain explicit rather than
being implied by `verified`.

Invalid lines remain in the source journal for forensics and receive a bounded,
redacted quarantine copy. Archives are explicit `.jsonl.gz` snapshots.
Retention is never automatic: prune is a dry-run unless `--apply` is present.
Command execution uses argv with `shell:false`; shell interpretation requires
the explicit `--shell` flag and one command string.

## Consequences

Positive:

- A green verdict is bound to fresh inputs and survives deterministic replay.
- Unrelated changes do not invalidate independent evidence, reducing reruns and
  token spend.
- Findings, exceptions and proofs retain a complete auditable history.
- The universal path remains plain JSON/JSONL/gzip with no database or account.

Negative:

- Computing the Git worktree hash adds bounded local process and file I/O.
- Local self-hashes detect corruption and unsophisticated rewriting, not an
  attacker who controls the same user account and recomputes the journal.
- Invalid source lines are preserved, so quarantine is a signal rather than a
  repair operation.

## Alternatives considered

- **Separate mutable `findings.jsonl`, `evidence.jsonl` and summary state**:
  rejected as canonical stores because cross-file commits can tear. They may
  exist later only as derived projections of the unified journal.
- **Invalidate every proof on every change**: safe but rejected because a CSS
  change should not rerun migration evidence; it wastes time and tokens.
- **Treat a successful command as permanently verified**: rejected because it
  creates false greens after the tested inputs change.
- **Require a database or OS keychain**: rejected from the universal path
  because it breaks the self-contained cross-platform contract. Optional signed
  or CI-attested producers can be layered later.

## Reversal cost

Medium. Evidence schema v1 and event history must remain readable, but storage,
attestation and projections can evolve behind the deterministic reducer.
