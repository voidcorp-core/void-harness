---
schemaVersion: 1
id: "adr:948a3686-d629-45f7-a6a7-f0e4acbc3e8b"
createdAt: "2026-09-10T12:55:27.501Z"
title: "Separate version-independent guidance from compiler capabilities"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Separate version-independent guidance from compiler capabilities

## Context

The TypeScript 7.0.2 consumer in DEV-743 could not dispatch a mission because
reviewed profile ranges were treated as limits on all engineering advice.
A version ceiling cannot prove or disprove a version-independent recommendation.

## Decision

Use explicit version-independent technology declarations, mutually exclusive
with reviewed version ranges. Existing profiles default to their bounded
contract. Keep expiry, incomplete detection and required review failures
blocking. Configuration advice uses exact configuration-file selectors;
unrelated unavailable advice remains visible in plan and specialist context.

See the approved [spec](../specs/2026-09-10-consumer-version-compatibility.md).

## Consequences

- Consumer versions need not follow the meta-repository toolchain.
- A general-guidance profile is not a compiler/API compatibility certificate.
- Authors must justify independence from actual advice, and separate mixed
  configuration advice rather than erase all version ranges.
- Old runtimes reject the new declaration instead of guessing; update the
  complete published harness before restarting frozen missions.
- Existing mandatory verification and compiler adapter guards remain unchanged.

## Alternatives considered

- Extend the TypeScript upper bound: repeats the outage at the next major.
- Make all degraded states advisory: can certify missing required evidence.
- Probe arbitrary package APIs generically: a member-presence check cannot
  prove module resolution or semantic correctness across future versions.

## Reversal cost

Low for profile authoring, moderate for consumers using independent declarations:
reverting requires restoring bounded declarations and updating the full bundle.
No data migration, package installation or lockfile mutation is involved.
