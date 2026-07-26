---
schemaVersion: 1
id: "adr:f8861a2b-b9d6-43d5-b6d1-ec02eb6856bb"
createdAt: "2026-07-24T18:15:00.000Z"
title: "Run critical enforcement through one portable Node bundle"
status: accepted
deciders: [Folpe]
supersedes: []
---

# Run critical enforcement through one portable Node bundle

## Context

The safety floor must behave identically for Claude, Codex and CI on Windows
and POSIX. Shell predicates plus `jq` created two portability gaps: native
Windows could not execute them, and missing parsing dependencies could leave a
wired hook ineffective. CI also had to mirror local detection manually.

## Decision

Implement dangerous-command, protected-file, secret-content and TDD-order as
pure TypeScript rules behind one bounded `_void-hook.mjs` adapter. Native
runtime manifests and the PR diff driver invoke that bundle. Keep ten-line shell
adapters only for backward compatibility while the remaining quality and
lifecycle rules migrate.

## Consequences

Positive:

- Claude, Codex and CI share rule code, verdict codes, messages and evidence.
- Critical enforcement needs only the Node runtime already required by the CLI.
- Invalid, oversized, binary and multi-file inputs are normalized or rejected
  fail-safe.
- Native manifests do not require Bash, enabling Windows execution.
- Codex manifests compile a quoted absolute final-project path, avoiding
  POSIX-only Git command substitution and staging-directory leaks.

Negative:

- The generated hook bundle grows.
- The transition temporarily retains shell libraries for non-critical rules.
- CI still needs a thin shell diff adapter for Git and GitHub annotations.

## Alternatives considered

- Continue with shared shell predicates: rejected because it preserves the
  Windows and `jq` dependency gaps.
- Duplicate rules in runtime-specific adapters: rejected because parity would
  depend on synchronized implementations.
- Scan the repository inside every inline hook: rejected because latency and
  false positives would make the floor unusable.

## Reversal cost

Low. The pure verdict contract can be hosted by another portable runner while
runtime manifests keep the same rule names and exit semantics.
