---
date: 2026-06-26
title: "prior art reviewed: patoles/agent-flow (mined for P2, not P1)"
---

## 2026-06-26: prior art reviewed: patoles/agent-flow (mined for P2, not P1)

**Decision:** agent-flow (live runtime agent visualizer, React/Next + 2D canvas +
SSE hook server) was reviewed. Borrowed for Plan B: its render decomposition into
small focused draw-modules and isolated camera/interaction/particles concerns.
Deferred to P2 as reference: its JSONL event schema (parentId/runtime/sessionId ->
our `activations.jsonl`), its HTTP-hook -> SSE transport (-> `graph live`), and its
timeline/scrubber (-> replay). Its 2D-canvas/React stack and run-physics data model
were not adopted (we are locked on 3D / 3d-force-graph and a structural model).
