---
schemaVersion: 1
id: "adr:9371b450-1695-413c-bb84-b3438e6e7410"
createdAt: "2026-09-20T09:32:55.188Z"
title: "Distribute the TypeScript Machine as one private layered package"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Distribute the TypeScript Machine as one private layered package

## Context

Folpe approved the bounded TypeScript port and single-package foundation plan.
ORCH confirmed on 2026-09-20 that distribution stays in the existing CLI; the
architecture review found no blocker. Rust mixes generic mechanisms with Git,
skill and merge policy. Moving those responsibilities requires explicit owners.

## Decision

Use one private packages/void-machine workspace with application composition,
development policy and concrete adapters, adding generic core mechanisms only
when a retained capability requires them; bundle it through voidharness.

No coordinator port, model/provider identity, Git concept or presentation policy
belongs in the generic core. No new published package, service or Docker artifact
is created. Doctor starts without a core module because its policy is specialized.
Environment and paths are injected; CLI environment resolution stays at the edge.

The npm launcher switches only in A5. Until then an explicit candidate executable
supports parity checks while the installed product is untouched. The existing
2,000,000-byte tarball ceiling is measured before the switch, not silently raised.
A maintained TOML parser implements real syntax; three known keys do not justify
a second handwritten parser. Syntax and domain validation remain separate.

## Consequences

Positive:

- One distributable and no runtime native binary/download requirement.
- Development rules cannot become universal mission policy through legacy imports.
- Explicit paths and environment allow non-Mac and later container use.

Negative:

- CLI build must bundle the private package and parser licenses.
- Parity tests must distinguish report values from exact identity bytes.
- Package size may require a measured packaging change before A5.

## Alternatives considered

- Port into mission-engine: rejected because it imports harness controller concerns.
- Publish a separate Machine package: rejected because the approved distribution
  is the existing CLI and a second release surface adds coordination cost.
- One package per layer or dynamic plugins: rejected without a concrete A need.
- Keep Rust: rejected by the approved TypeScript ownership decision and scope.

## Reversal cost

Medium: restore the previous pinned CLI/native pairing and its launcher from Git;
no state migration is introduced by this packaging decision. Existing durable-run
readers, user files and journals are preserved. Active-install changes need their
own authorization. This record complements the TypeScript layer ownership ADR;
it does not rewrite historical decisions.
