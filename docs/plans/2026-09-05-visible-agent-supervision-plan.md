---
title: Visible native agent supervision
date: 2026-09-05
status: executing
spec: docs/specs/2026-09-05-visible-agent-supervision.md
author: Folpe + Codex
high_risk: false
---

# Goal

Apply the approved left coordinator / right stacked workers layout to real native
execution, preserving existing user surfaces. No new runtime or execution registry.
Folpe explicitly approved proceeding with this layout in the conversation.

## Steps

1. Identify the current coordinator surface through cmux identify; label it ORCH
   and add a violet role status. TDD: souple, native configuration only, no source
   logic. Verify title and status by querying cmux. Preserve unrelated surfaces.
2. At each authorized native worker launch, create the first worker surface to the
   right of the coordinator; place subsequent workers below the prior worker.
   At most three visible worker surfaces. Use explicit returned surface identities.
   TDD: souple for native operations; strict if reusable event mapping logic proves
   necessary. Verify the tree, native session identity and visible state. Never
   create a second agent to mirror one that lacks a terminal surface.
3. Validate a real DEV-832 journey in that layout. Link state to observed events,
   distinguish completed reviews from certified delivery, and clear owned display
   resources when finished. Verify user surfaces/work and native resume references
   survive cleanup. TDD: souple, real runtime evidence; no tautological UI tests.

## Review and handoff

No additional design gate: the user approved this bounded presentation slice.
The existing DEV-832 tracker retains execution evidence; no duplicate ticket state.
Commit the spec/plan with the resulting bounded integration using commit discipline.
Extend runtime behavior only through a separately reviewed, tested change if needed.

## Delivery evidence, 2026-09-05

Local executable `scripts/mission-presentation.mjs` now supplies cmux and explicit
text presentation through one request interface; callers retain runtime execution.
Repository instructions link the procedure in `docs/NATIVE-SUPERVISION.md`.

Observed live: workspace14 owned by project void-harness/mission DEV-832, repeated
ensure reused it, existing coordinator surface11 migrated without another runtime.
First test surface52 appeared right, second surface53 below it; native accessibility
inspection confirmed the nested left/right layout. Both empty test surfaces and
their status entries were removed afterwards. Native reviewers can use overview-only
status without a terminal. The runtime did not execute an agent inside those test
surfaces, and no DEV-832 consumer acceptance is inferred from this layout test.

Nine focused behavior tests protect reuse, explicit creation, the three-pane bound,
ambiguity, interrupted creation, fallback, native acknowledgement parsing and
no-terminal overview identities. Independent review presentation-review-20260905-02
found no blocking issue. A real consumer runtime journey remains DEV-832 work.
This first slice is local and not yet published through the npm package.
