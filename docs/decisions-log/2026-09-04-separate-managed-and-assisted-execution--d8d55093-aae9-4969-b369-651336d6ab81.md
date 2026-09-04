---
schemaVersion: 1
id: "adr:d8d55093-aae9-4969-b369-651336d6ab81"
createdAt: "2026-09-04T10:06:09.626Z"
title: "Separate managed proof-carrying execution from assisted execution"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Separate managed proof-carrying execution from assisted execution

## Context

Users must retain native Claude Code and Codex sessions, while autonomous runs need stronger claims
than a prompt or post-hoc Git inspection can justify. Calling both paths proof-carrying would hide
which transitions, permissions and effects the Machine actually observed.

## Decision

Expose separate managed and assisted assurance levels, and reserve autonomous or proof-carrying
claims for execution supervised by the Machine.

Managed execution launches the runtime, contains permissions, mediates authoritative effects and
seals evidence. Assisted execution installs the same skills and may import observable artifacts,
but its proof names everything the Machine could not observe.

## Consequences

Positive:

- Guarantees are honest and mechanically testable without removing familiar direct-runtime usage.
- Skills remain portable while assurance follows the execution boundary rather than branding.

Negative:

- Documentation and the Workbench must make the assurance distinction unmissable.
- Some direct-session outcomes cannot satisfy autonomous gates without a new managed run.

## Alternatives considered

- **Call every installed session managed**: rejected because hooks or prompts cannot prove state and
  effect authority.
- **Forbid direct runtime sessions**: rejected because it breaks the subscription-native developer
  workflow and makes the harness intrusive.
- **Trust a worker's final report**: rejected because a claim from the actor being checked is not
  executor evidence.

## Reversal cost

**Medium.** The implementation boundary is easy to change, but public proof terminology and stored
assurance records require a versioned migration once consumers depend on them.
