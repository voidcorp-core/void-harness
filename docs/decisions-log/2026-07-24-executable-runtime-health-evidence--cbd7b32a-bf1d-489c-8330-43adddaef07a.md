---
schemaVersion: 1
id: "adr:cbd7b32a-bf1d-489c-8330-43adddaef07a"
createdAt: "2026-07-24T17:15:22.839Z"
title: "Executable runtime health evidence"
status: accepted
deciders: ["Folpe","Codex"]
supersedes: []
---

# Executable runtime health evidence

## Context

`doctor` and `status` previously promoted file footprints into health claims. A
Codex manifest could exist while its hook was missing or non-executable, Claude's
plugin cache could be absent while doctor stayed green, and ProjectState called a
capability `verified` from its release-time owner/runtime declaration alone.
Telemetry hooks intentionally exit zero when their recorder fails, so process exit
is not sufficient proof either.

## Decision

Represent runtime health as five independent tri-state signals: `installed`,
`wired`, `fired`, `observed` and `certified`. Runtime adapters own executable
postconditions and exercise the installed activation hook against an isolated
fixture; the smoke is green only when the expected canonical event is read back.
`null` means unknown and is never promoted. A capability becomes locally
`verified` only when a compatible installed runtime is wired and fires; the
frozen structural certification remains separately visible as `certified`.

## Consequences

Positive:

- a present manifest, zero exit or structural declaration can no longer produce a
  false green;
- Claude-only, Codex-only and non-Git projects retain runtime-scoped checks;
- status preserves missing measurements as `unknown` and scoring excludes them;
- every adapter exposes the same postcondition contract.

Negative:

- `doctor` and `status` execute a bounded local hook smoke and therefore cost a
  short Node process;
- the POSIX wrapper cannot be exercised on Windows until the Node hook runner
  replaces the shell adapter, so that signal remains `unknown`;
- a compromised local user can forge local observations; this is health evidence,
  not remote attestation.

## Alternatives considered

- Keep file-presence heuristics and improve messages: rejected because wording
  cannot make an unexecuted hook trustworthy.
- Trust exit code zero from the hook: rejected because telemetry adapters
  deliberately fail open for agent continuity.
- Invoke a real Claude/Codex session on every doctor run: rejected because it
  requires runtime credentials, costs tokens and makes the local baseline
  non-deterministic. Full runtime conformance remains a later certification gate.

## Reversal cost

Medium. The evidence fields are persisted in ProjectState and consumed by status,
but adapters remain the single seam and the tri-state contract can be versioned.
