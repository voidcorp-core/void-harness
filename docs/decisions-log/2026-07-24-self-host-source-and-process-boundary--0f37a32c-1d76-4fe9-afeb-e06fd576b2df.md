---
schemaVersion: 1
id: "adr:0f37a32c-1d76-4fe9-afeb-e06fd576b2df"
createdAt: "2026-07-24T19:35:00.000Z"
title: "Bind self-host artifacts to current sources and minimal child environments"
status: accepted
deciders: [Folpe]
supersedes: []
---

# Bind self-host artifacts to current sources and minimal child environments

## Context

The source self-host initially built the hook runner from TypeScript but called
runtime adapters already loaded from `dist`. A local source edit after the last
CLI build could therefore produce an artifact whose receipt claimed newer
adapter sources than the bytes that wired it. Compilation also had a
time-of-check/time-of-use window, and doctor probes inherited ambient
credentials that neither `--version` nor the hook smoke required.

## Decision

Self-host compiles a disposable runtime-wiring worker from the current adapter
TypeScript and executes that worker inside the staging boundary. It hashes the
bounded source set before compilation and again immediately before publication;
different hashes abort without replacing the last green artifact.

Doctor child processes receive only a portable operating-system allowlist plus
the explicit `VOID_*` values needed by the hook probe. Ambient home paths,
provider credentials, registry tokens and unrelated process configuration are
not forwarded.

The root dependency graph also overrides known-vulnerable build-only
transitives to their patched compatible range, with `pnpm audit` as the
verification gate.

## Consequences

Positive:

- The receipt now describes the adapter and hook sources that actually produced
  the artifact.
- Concurrent source drift fails closed before the atomic swap.
- Runtime smoke processes cannot read ambient API or registry credentials.

Negative:

- A changed source checkout performs a second bounded hash and an additional
  esbuild compilation.
- A runtime whose `--version` unexpectedly requires user configuration is
  reported degraded instead of receiving the maintainer's whole environment.

## Alternatives considered

- Require contributors to rebuild `dist` manually before every sync: rejected
  because the command would still be capable of certifying stale adapter code.
- Forward all environment variables and redact logs: rejected because redaction
  happens after disclosure to the child.
- Lock the whole repository during compilation: rejected because it would
  serialize concurrent agents and still need stale-source detection.

## Reversal cost

Low. The worker is disposable and internal; the environment allowlist and
source-hash gate can evolve without changing the receipt schema.
