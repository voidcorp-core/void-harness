---
schemaVersion: 1
id: "adr:af4c0446-66f4-462f-b123-9217b9c5435a"
createdAt: "2026-07-24T18:51:00.000Z"
title: "Install one portable runtime asset"
status: accepted
deciders: [Folpe]
supersedes: ["legacy:2026-06-01-jq-is-a-hard-runtime-dependency-surfaced-by-doctor"]
---

# Install one portable runtime asset

## Context

The native Claude and Codex manifests now route enforcement, formatting,
context injection, bounded output trimming, typecheck and telemetry through the
same Node bundle. Continuing to install shell adapters and their sourced
libraries would preserve an unused `jq` and POSIX dependency, enlarge receipts,
and make health depend on files that no active command executes.

## Decision

Local runtime adapters install only `_void-hook.mjs`. Native manifests pass an
explicit runtime argument and invoke the bundle through Node. Shell files remain
in the source package as short compatibility adapters for older installations,
but are neither referenced nor staged by a v3 local install.

Commands in new `.void/config.json` files are argv arrays. Legacy shell strings
remain valid during migration and produce a doctor warning, but lifecycle hooks
never execute them through a shell. Hook outcomes use canonical
`hook.completed` events with bounded, redacted payloads.

## Consequences

Positive:

- Local Claude and Codex installs require Node only, with no `jq`, Bash, Python,
  Bun, account or network dependency.
- Windows and POSIX execute the same bundle; Node assets do not depend on an
  executable bit stripped by npm packaging.
- Each lifecycle action has a timeout, bounded output and observable `ok`,
  `skipped` or `degraded` state.
- Receipts and drift checks own one runtime file instead of a shell tree.

Negative:

- Compatibility shell files remain in the source tree until the migration
  window closes.
- The bundle grows because it contains enforcement and lifecycle adapters.
- Codex output rewriting remains deliberately unwired until its
  `updatedToolOutput` behavior is proven live.

## Alternatives considered

- Keep installing all shell files: rejected because unused compatibility debt
  would remain a runtime dependency.
- Bundle `jq`: rejected because Node already parses the canonical input and an
  extra platform binary adds supply-chain and release complexity.
- Execute legacy command strings with `shell:true`: rejected because quoting,
  injection and cross-platform behavior would become part of the contract.

## Reversal cost

Low. A future runner can replace the single staged asset while keeping rule
names, argv configuration and hook event contracts stable.
