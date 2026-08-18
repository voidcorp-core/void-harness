---
schemaVersion: 1
id: "adr:a2c49296-8b65-4b5a-b674-97fc99ce927a"
createdAt: "2026-08-18T13:12:04.000Z"
title: "The void-plugins deprecation period is over"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The void-plugins deprecation period is over

## Context

On 2026-07-22 the plugin marketplace moved out of a dedicated catalog repo,
`voidcorp-core/void-plugins`, and into this one. That record closed with a
condition rather than a date: installs already pointing at the old repo would
keep working because it stayed alive, deprecated, "until installs migrate".

A condition with no owner is a condition nobody closes. The repository is gone,
and the codebase kept describing it as if it were reachable: two test fixtures
named it as a live marketplace, and the record still read as an open deprecation.
Nothing failed, because no test reaches the network, which is precisely why it
could sit there for a month.

That record is immutable and says what was true when it was written. This one
says what is true now.

## Decision

The deprecation is over. `voidcorp-core/void-plugins` no longer exists and is no
longer honoured as a migration path; an install still pinned to it must repoint
at `voidcorp-core/void-harness`.

## Consequences

Positive:

- The codebase stops naming a repository that cannot be reached. A fixture that
  describes a dead address teaches the wrong thing to whoever reads it next, and
  it is exactly the kind of statement no test can falsify.
- The open-ended condition is closed by a record rather than by attrition.

Negative:

- An install that never migrated breaks rather than degrading, and it breaks at
  a fetch with a repository-not-found error rather than with a message naming
  this decision. Given the migration path has been the default for every new
  install since July, the population is believed to be empty, which is a belief
  and not a measurement.

## Alternatives considered

- **Keep the fixtures and leave the record open.** Rejected: the tests pass
  because nothing reaches the network, so the fixtures assert nothing about the
  repository they name. Code that survives only because it is never exercised is
  the definition of what should be removed.
- **Remove `marketplaceRepoFrom` as back-compat.** Rejected, and this is the
  correction worth recording: the function was introduced under this deprecation,
  but its purpose outlived it. It reads the marketplace repo from settings so
  that `add`, `remove`, `check` and `update` never silently re-pin someone's fork
  or private mirror onto the default. Deleting it would take that away from every
  fork, which is a capability, not a leftover.
- **Add a named error when a project is still pinned to the old repo.** Rejected
  for now: it would be a message on a path believed to have no traffic, and the
  underlying fetch already fails loudly. Worth revisiting only if someone reports
  the confusing version of that failure.

## Reversal cost

Low, and asymmetric. Restoring the fixtures is trivial; restoring the retired
repository is not ours to do, which is the real reason the deprecation had to be
closed in writing rather than left to lapse.
