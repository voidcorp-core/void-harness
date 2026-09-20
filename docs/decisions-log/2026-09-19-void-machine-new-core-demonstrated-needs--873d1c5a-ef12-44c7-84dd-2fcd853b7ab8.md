---
schemaVersion: 1
id: "adr:873d1c5a-ef12-44c7-84dd-2fcd853b7ab8"
createdAt: "2026-09-19T15:43:43.928Z"
title: "Build Void Machine on a sound Rust core without inherited harness controls"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Build Void Machine on a sound Rust core without inherited harness controls

## Context

Folpe explicitly approved this direction on 2026-09-19. The afternoon spent
unblocking WORK-1/2/3 is a counterexample: operating the controls became more
complex than the work they governed. The previous design bundled continuation of the existing Rust core with
prescriptions for a Node bridge and harness review machinery, without sufficiently
distinguishing sound core work from controls needing their own justification.

## Decision

Continue the existing Void Machine Rust core when it is sound and aligned with
the vision; do not inherit the harness architecture or controls by default.

Folpe explicitly clarified that the Rust core is Void Machine itself, already
under construction. "New core" distinguishes it from the harness control system;
it is not an instruction to discard sound Rust work or rewrite it in another
language. First assess and build on that core. Replace only a part with a demonstrated
incompatibility or defect; justify any replacement as well as any reused control.

The coordinator dispatches, relays questions and collects results. The mission
runtime owns deterministic transitions, waits, recovery and closure; native agent
runtimes retain reasoning and session capabilities. Every wait identifies its
cause, owner and resolution action. Context completion retains mission/history,
valid results and the same review round; changed work invalidates only dependent
results. No new authority or budget comes from a restart.

Controls block on a demonstrated consequence for security, permissions, data
integrity or an unmet acceptance criterion. Reviews are bounded, corrections
receive focused verification and future evidence is not due prematurely. Coding
requirements belong to the coding vertical. The core contract is independent of
languages, frameworks, models, editors and display tools.

Persist decisions and useful execution state independently of coordinator memory.
Collect a finished agent's result and close its owned panel. Proofs and worktrees
have separate lifecycles. For each reused mechanism, document the concrete need,
benefit, operating/maintenance cost and simpler alternative in the existing design;
this is design rationale, not another approval service or runtime gate.

The first acceptance journey delivers a result from an intention through one
clarification, interruption and correction, preserving work and history without
replaying an effect, redundant human approval or an unbounded review loop. Measure
elapsed/active/waiting time, observed cost and human interventions, with unknown
coverage explicit. Reproducing this afternoon's blocking process fails acceptance,
even if each component looks individually well designed.

## Consequences

Positive:

- The complete user journey, rather than inherited machinery, governs the design.
- Native capabilities and useful existing code remain candidates when justified.
- Safety and integrity remain outcomes to prove; process complexity is not quality.

Negative:

- Earlier control and bridge prescriptions require reassessment against the
  journey. Sound existing Rust core work is retained; replacement needs a concrete reason.

Finish the bounded WORK-1/2/3 delivery first. This decision authorizes design-document
updates only, not extra controls in the current harness, a release or consumer update.
Historical ADRs and existing mission records are preserved. This proposed ADR records
an explicit human decision; it has not yet been merged as an accepted repository ADR.

## Alternatives considered

- **Extend the existing controller and migrate every control:** rejected as the
  default because it carries forward the operating cost demonstrated by the incidents.
- **Discard and rewrite the existing Rust core by principle:** rejected because
  sound Void Machine code is an asset, not the source of the harness incidents.
- **Put orchestration and recovery entirely in conversational memory:** rejected
  because waits, effects and continuity would depend on an agent remembering them.

## Reversal cost

Medium: adopting legacy ownership later requires evidence of equivalent mission
behavior and a deliberate state migration; no existing record may be discarded.
