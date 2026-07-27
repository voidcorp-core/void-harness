---
schemaVersion: 1
id: "adr:3ee5c05a-3b22-4b5f-83b8-b46e59f8cefa"
createdAt: "2026-07-27T13:07:03.723Z"
title: "Gate UI approval with two fresh specialist passes and current-diff evidence"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Gate UI approval with two fresh specialist passes and current-diff evidence

## Context

UI implementation combines two different judgments: deciding the intended experience before code,
then judging the rendered craft after code. Letting one builder perform and approve both passes
creates confirmation bias. Screenshots can also survive after a CSS or component edit and appear
valid while describing an older diff. A model-only visual opinion cannot prove keyboard behavior,
viewport coverage, or rendered states.

## Decision

Use two canonical read-only specialists around the build: Experience Designer produces the
pre-build brief, and Visual Craft Director reviews post-build evidence in a different fresh context.
For an applicable UI pass, approval is blocked unless tests and mobile/desktop captures cover every
applicable state, bind to the current diff hash, and all six craft dimensions score at least 8/10.
Unavailable browser evidence blocks rather than degrading to model-only certification.

## Consequences

Positive:

- The builder receives concrete IA, interaction-state, responsive, keyboard, and accessibility intent
  before implementation starts.
- Independent post-build judgment reduces self-approval bias.
- Current-diff identities make later UI changes invalidate stale screenshots and tests deterministically.
- The mission engine remains pure and runtime-neutral; browser capture stays in the QA adapter.

Negative:

- UI work needs two bounded specialist invocations and more evidence than non-UI work.
- Every applicable state multiplies mobile and desktop capture work.
- A session without an available browser cannot certify UI quality.

## Alternatives considered

- A single design specialist for both phases was rejected because it reuses assumptions and weakens
  the independent fresh-context check.
- Builder self-review through `frontend-design` and `ui-review` alone was rejected because skills
  teach one active context; they do not supply an independent verdict.
- LLM scoring without screenshots and behavioral tests was rejected because it cannot prove a
  rendered viewport, keyboard interaction, or evidence freshness.
- Permanent visual snapshots without a diff identity were rejected because a later CSS change would
  silently inherit obsolete approval.

## Reversal cost

Medium. The specialist contracts and pure gate are removable without migrating consumer data, but
projects and evals will rely on the evidence shape and fail-closed behavior once shipped.
