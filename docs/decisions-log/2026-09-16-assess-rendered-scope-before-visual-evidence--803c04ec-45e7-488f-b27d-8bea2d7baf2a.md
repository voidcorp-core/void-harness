---
schemaVersion: 1
id: "adr:803c04ec-45e7-488f-b27d-8bea2d7baf2a"
createdAt: "2026-09-16T08:09:45.852Z"
title: "Assess rendered scope before requiring visual evidence"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Assess rendered scope before requiring visual evidence

## Context

DEV-843 follows a blocked review of DEV-531: an interface-motion guidance change
selected the visual specialist, whose v2 instructions required screenshots even
though no rendered interface changed. Ticket subject and frontend profile signals
select expertise; neither establishes that there is a rendered surface to certify.
Routing is frozen before implementation, when a clean tree cannot prove absence.

## Decision

Keep conservative specialist selection and make the visual specialist establish
rendered-surface applicability from revision-bound evidence before requiring captures.

A complete relevant post-implementation scope with no rendered-interface change
permits a completed applicability assessment: the existing `pass` verdict includes
an explicit not-applicable explanation and inspected paths in `limitations`. This
does not certify visual craft and must not invent scores or captures. Actual UI,
including templates in arbitrary source files, retains every existing proof requirement.
Mixed changes are UI changes. An empty pre-implementation diff is not negative proof.

Relevant omissions must be resolved by permitted exact-path reads whose content is
demonstrably tied to the reviewed revision and receipt. A SHA label alone is not a
binding. Missing, stale, or unresolved relevant scope requires `blocked`. An unrelated
omission is not automatically fatal, but its irrelevance must be justified.

The completion schema, routing signals, quality gate, and historical missions stay
unchanged. Contract v3 is used only by a new mission; v2 verdicts are preserved.

## Consequences

Positive:

- Guidance can complete without fabricated browser evidence.
- Conservative routing still catches nonstandard renderers selected through a profile.

Negative:

- Some non-UI work still invokes a specialist to establish applicability.
- Scope assessment is a review judgment and requires native behavioral evidence.

## Alternatives considered

- **Drop broad UI/profile triggers:** loses clean-tree planned UI and template renderers
  such as `render-page.mjs` whose ticket merely says "fix spacing".
- **Add a typed scope declaration to tickets:** adds a new input contract and validation
  surface when existing diff evidence can answer the question; a declaration still
  cannot override positive actual UI evidence.
- **Exempt guidance by filename:** cannot distinguish prose examples from executable
  templates or mixed changes and would turn an extension heuristic into negative proof.

## Reversal cost

Low. A subsequent specialist contract version can change applicability instructions
without a ticket migration. Historical mission receipts remain immutable.
