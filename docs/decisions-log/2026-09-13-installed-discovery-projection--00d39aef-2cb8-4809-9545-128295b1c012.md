---
schemaVersion: 1
id: "adr:00d39aef-2cb8-4809-9545-128295b1c012"
createdAt: "2026-09-13T17:18:32.338Z"
title: "Project installed discovery from canonical CLI metadata"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Project installed discovery from canonical CLI metadata

## Context

DEV-532 needs a consumer-facing offline catalogue and local availability.
The existing source Markdown generator cannot inspect an installation, while
calling status also writes history and resolves registry freshness. Commands
are dispatched in main.ts but described separately in help.ts.

## Decision

The distributed CLI owns one typed read-only discovery projection, fed by
canonical shipped catalogue, specialist contracts and shared command metadata,
and renders HTML, Markdown and JSON from that projection.

## Consequences

Positive:

- Adding a catalogue capability changes every format without renderer edits.
- Command metadata has one owner shared with help and checked against dispatch.
- Installation facts remain separate from observed runtime verification.
- Exports contain no machine paths or source-only Linear data.

Negative:

- Local evidence needs a bounded read-only adapter rather than reusing status.
- The source documentation generator and consumer presentation remain separate
  because their purposes and installation boundaries differ.

## Alternatives considered

- Extract command help and dispatch syntax during build: rejected because text
  shape becomes the contract, while local availability still needs runtime reads.
- Import the source Markdown generator into the CLI: rejected because it pulls
  maintainer tooling across the consumer boundary and cannot supply local facts.

## Reversal cost

Medium. Rendering can change independently, but a replacement must preserve the
published versioned JSON contract and command invocation semantics.

The scope and approach are approved in
[the spec](../specs/2026-09-13-installed-cheatsheet.md) and
[the plan](../plans/2026-09-13-installed-cheatsheet-plan.md).
