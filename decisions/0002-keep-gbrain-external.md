# ADR-0002: Keep gbrain external, with a defined exit criterion

- **Status**: accepted
- **Date**: 2026-07-10
- **Deciders**: @folpe

## Context

gbrain (`setup-gbrain`, `sync-gbrain`, `context-save`, `context-restore`) is a heavy parallel product: a code-search index (PGLite / Supabase) plus a cross-session context handoff. The cartography classifies it KEEP-EXTERNAL. Two of its capabilities matter to the harness:

1. **Code search** — the harness does not have a native semantic code index; it relies on Grep/Glob + subagent exploration.
2. **Cross-session context handoff** (`context-save`/`context-restore`) — a *real, recurring* need. Long initiatives (this de-gstackification epic itself) span many sessions; the state has to survive. Today that need is served by a mix of Claude's file-based memory (`MEMORY.md`), Linear tickets, `docs/DECISIONS.md`, and the ADRs — not by gbrain.

The teardown must not drop the handoff need on the floor: if gbrain goes, its replacement must exist **before**, not after.

## Decision

We will **keep gbrain external** (installed, unmanaged by the harness) rather than vendor or drop it, until the harness's own primitives — `.void/`, `learning-capture`, Claude file-memory, and the Linear/DECISIONS/ADR trail — demonstrably cover its two load-bearing capabilities. gbrain is not part of the gstack teardown.

## Consequences

Positive:
- No effort spent re-implementing a code index or a bespoke context store the harness may not need.
- The cross-session handoff keeps working (via the current memory/Linear/ADR mix) with gbrain as a fallback.
- Decoupled from the gstack teardown — cutting gstack does not cut gbrain.

Negative:
- A lingering external dependency the harness does not govern; drift risk.
- Two overlapping context mechanisms (gbrain vs `.void`/memory) until the exit criterion is met — mild confusion about which is source of truth.

## Alternatives considered

- **Vendor gbrain into the harness**: rejected — a code-index + storage product is a large, stateful subsystem well outside the harness's prose-skill scope; anti-bloat and maintenance burden.
- **Drop gbrain now**: rejected — it would drop the cross-session handoff need before a proven replacement exists. The ticket's own edge case flags this: `context-save`/`context-restore` is used in practice; cover it *before* teardown, not after.

## Exit criterion (what must be proven to cut gbrain)

Cut gbrain (a new superseding ADR) once **both** hold, observed not assumed:

1. **Context handoff** — a long multi-session initiative completes cleanly using only Claude file-memory + Linear + `docs/DECISIONS.md` + ADRs, with no lost state that gbrain would have preserved. (The de-gstackification epic is a live test of exactly this.)
2. **Code search** — either the harness adds a native index, or Grep/Glob + subagent exploration proves sufficient for the projects in flight (no repeated "I couldn't find X" failures that an index would have solved).

Until both are demonstrated, gbrain stays.

## Teardown coupling (Vague 6, DEV-395)

gbrain is **out of scope** for the Vague 6 gstack teardown. Its `~/.gstack/`-adjacent state (if any) and the `chromium-profile` cookies question are cross-referenced with the browse decision (DEV-390). The teardown references this ADR to know gbrain is "leave installed, do not remove."

## Reversal cost

**Medium.** Keeping it external is cheap to reverse (drop later when the exit criterion is met). Cutting it prematurely is expensive to reverse (rebuilding the handoff + index under time pressure), which is why the decision is keep-with-criterion rather than drop-now.
