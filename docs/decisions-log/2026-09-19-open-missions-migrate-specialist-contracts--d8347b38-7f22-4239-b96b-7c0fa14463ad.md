---
schemaVersion: 1
id: "adr:d8347b38-7f22-4239-b96b-7c0fa14463ad"
createdAt: "2026-09-19T13:13:53.049Z"
title: "Open missions migrate specialist contracts without erasing review obligations"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Open missions migrate specialist contracts without erasing review obligations

## Context

The open WORK-1 and WORK-3 missions bind visual-craft-director v2. That contract
requires rendered captures, including for changes that expose no rendered interface.
The existing v3 contract permits an evidence-bound scope assessment, but neither
relabeling a v3 result as v2 nor editing the frozen controller plan preserves the
meaning of the recorded review. WORK-3 also retains current visual evidence obligations.
These obligations prevent the fresh assessment needed to resolve them.

## Decision

Provide one explicit, append-only migration of an open mission's visual specialist
from the declared v2 contract to the declared v3 contract, requiring a fresh review
and preserving historical results, obligations, mission identity and actual budgets.

The command observes assets and native capability itself and compares the expected
journal hash and active episode under the existing writer lock. A versioned declaration
pins both contract hashes; the original official v2 bytes remain in a distribution
history directory outside the active specialist catalog. Callers cannot supply paths,
capability claims, hashes or budget overrides. The frozen plan remains immutable.

A queued but unstarted v2 request may be explicitly superseded in the migration event.
An invocation that started and has no terminal result blocks migration. Superseded
requests cannot later start or complete. Validated projection affects future requests
only; it never rewrites past verdicts.

A verified migration permits exactly its fresh specialist review while its own recorded
legacy evidence obligations remain pending. This limited dispatch cannot authorize a
writer, certify the mission, bypass unrelated obligations or grant a new round. The
ordinary evidence protocol must explicitly discharge historical obligations afterward.
Failed reviews and exhausted budgets retain their ordinary refusal semantics.

The isolated candidate proves the complete transition first. Activating v3 in the real
native installation requires separate user authorization; this decision neither grants
that authorization nor changes the installed protective harness.

## Consequences

Positive:

- Existing missions can reach an honest review under the current contract without
  losing their original evidence, identifiers or safety boundaries.
- Identical retries reuse the verified migration receipt without replaying effects.

Negative:

- The reader must validate one additional event and retain the official old contract
  artifact needed to verify the declared transition.
- Real activation remains blocked until the native installation exposes the declared
  target contract; an isolated proof alone does not establish that capability.

## Alternatives considered

- Reinterpret v2 or return an informal non-applicable PASS: rejected because this changes
  the historical certification contract without recording a valid transition.
- Recreate or close/recover the mission to select v3: rejected because it changes mission
  identity or uses an unrelated lifecycle transition and can conceal budget consumption.
- Add generic migration machinery or separate capability roots: rejected as unnecessary
  scope; the existing journal, lock, capability and proof protocols provide the boundaries.

## Reversal cost

Medium. The command can be removed from future dispatch, but recorded migration events
and historical contract bytes must remain readable so existing mission histories retain
their meaning. Reversal never rewrites completed review verdicts.
