---
schemaVersion: 1
id: "adr:854a6439-cca2-4de5-9cbf-323fadc3bfe9"
createdAt: "2026-09-12T15:48:45.906Z"
title: "Preserve native file identifiers without numeric rounding"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Preserve native file identifiers without numeric rounding

## Context

Windows reproduction captured inode 10414574139401466 in a valid scanned file.
The number exceeds JavaScript's exact integer range. The cache correctly refused
it as unsafe, but that refused publication then removed the prerequisite history
for incremental scans and rename chains. Native filesystem identifiers are opaque
64-bit values, not arithmetic quantities.

## Decision

Read native file identities with Node BigIntStats and transport them in an additive
identity pair of bounded, canonical unsigned 64-bit decimal strings, preserving
safe numeric v1 cache values without rewriting their checksummed payloads.

The native adapter always emits identity.device and identity.inode as strings.
Existing optional device/inode number fields are emitted only when safe, retaining
their public types. Cache and injected filesystem inputs may still carry safe
legacy numbers without the new pair. If both representations are present they
must agree; malformed exact evidence cannot fall back to legacy values.
Invalid numbers, noncanonical strings and values outside uint64 remain refused.
Identity comparisons use exact values; native before/after read checks also retain
nanosecond timestamps. Sizes remain bounded numbers and timestamp transport stays
in milliseconds. The existing root-generation identity already uses exact strings.

## Consequences

Positive:

- Large Windows file identifiers can be cached without truncation or rounding.
- Adjacent large identities remain distinct and old valid numeric caches remain readable.
- Cache publication, confinement, symlink and concurrent-change guards are preserved.

Negative:

- Consumers needing every native identity use the new exact pair. Existing optional
  numeric fields remain numbers when representable and are absent otherwise.
- Old readers cannot consume new string-identity cache entries. These caches are
  disposable optimization state, so an old reader must rebuild rather than trust them.
- This does not claim that every possible filesystem observation failure is repaired.

## Alternatives considered

- Relax the safe-integer check: rejected because rounded identifiers lose identity
  and can collapse two distinct files.
- Omit large identifiers: rejected because it removes evidence and degrades reuse
  instead of representing the platform's actual values.
- Widen the existing numeric return fields to number|string: rejected because it
  breaks typed consumers when an additive exact pair preserves compatibility.
- Require a new numeric-only cache schema: rejected because exact JSON decimal
  strings preserve values and safe legacy entries can be accepted without coercion.

## Reversal cost

Medium: changing back to numbers reintroduces lost precision and invalidates new
cache entries. A future format migration must preserve exact identity and maintain
an explicit read boundary for older cache payloads.

## Evidence

Windows metadata capture: https://github.com/voidcorp-core/void-harness/actions/runs/34702873070
Node API: https://nodejs.org/docs/latest-v24.x/api/fs.html#class-fsstats
