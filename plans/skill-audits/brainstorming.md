---
skill: brainstorming
status: reviewed
strategy: distill
target_loc: 350
phase: D
depends_on: []
composes_with: [writing-plans, tdd]
matrix_row: plans/skill-decision-matrix.md#brainstorming
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `brainstorming`

## Need

Without a brainstorming gate, an LLM agent starts coding the moment a request arrives — and produces well-written code for the wrong problem. The intent was not understood, constraints not surfaced, alternatives not explored, decisions not recorded. The spec exists only in the conversation, which evaporates. `brainstorming` exists to enforce: explore intent before code, identify constraints, propose 2–3 approaches with trade-offs, validate the design section-by-section, write the spec to disk, then transition to planning.

## Decision matrix anchor

- **Wins**: any creative task before code — feature scoping, design discussion, "should we build X this way?"
- **Loses to**: gstack `/office-hours` when the question is "should we build X at all?" (upstream, validates the idea)
- **Cannot decide**: implementation specifics (defers to `writing-plans`). Sub-domain identification (defers upstream to office-hours / plan-ceo-review)
- **Composes with**: `writing-plans` (downstream, mandatory transition after spec approval)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| superpowers/brainstorming | superpowers/skills | reviewed in depth (we used it to brainstorm this very harness) | kept as primary — hard gate, one-question-at-a-time, multi-choice preferred, 2–3 approaches with recommendation, spec-write, transition to writing-plans |
| gstack `/office-hours` | gstack/skills | reviewed | different niche (upstream "should we build it at all?"). Composed as predecessor when the user describes a new product idea. |
| compound-engineering plan phase | EveryInc plugin | reviewed | rejected as primary (no clear gate between explore and implement). Some pattern reuse (compound-loop reference) |
| Boris Cherny "how Boris uses Claude Code" | https://howborisusesclaudecode.com | reviewed | inspiration on the discipline of writing the design before code |

## Adaptation strategy

`distill`. Rewrite superpowers/brainstorming for void-harness. Three deliberate changes from the source:

1. Spec location: `docs/specs/YYYY-MM-DD-<topic>.md` (consumer convention) rather than `docs/superpowers/specs/`. Why: we are not subordinating consumer docs to a superpowers-shaped subdirectory.
2. Transition target: `voidcorp:writing-plans` (vendored equivalent), not `superpowers:writing-plans`. Why: keeps the harness self-contained once Phase D process skills ship.
3. No trigger filter on activation: per the project-lead decision (Section 0bis hedge resolution), keep the activation broad and let the user decline manually rather than encode an over-engineered filter. Why: simpler, more honest, lower maintenance.

## What we keep (verbatim or near-verbatim)

- **One question at a time** (superpowers): never ask multiple questions in a single message. Each question gets its own response so the user can answer precisely.
- **Multi-choice preferred** (superpowers): when a question has 2–4 viable answers, present them as multi-choice with brief descriptions and a recommended option. Open-ended is fine when no obvious options exist, but multi-choice is faster.
- **2–3 approaches with trade-offs** (superpowers): for the implementation question, propose 2–3 alternatives. Lead with the recommendation and the reason. Let the user redirect.
- **Present design in sections, approval after each** (superpowers): for a non-trivial design, break it into sections (architecture / data flow / error handling / testing / rollout). Get approval after each before moving on.
- **Hard gate before code** (superpowers): NO implementation skill is invoked, NO code is written, until the spec is written AND user has approved it. The gate applies to EVERY project, even ones that seem too simple to need a design.
- **Anti-pattern: "this is too simple to need a design"** (superpowers): the gate applies uniformly. Simple projects' designs are short (a few sentences for truly trivial ones), but they MUST be written and approved.
- **Spec self-review pass** (superpowers): after writing the spec document, look at it with fresh eyes: placeholder scan, internal consistency, scope check, ambiguity check. Fix inline.
- **User-reviews-spec gate** (superpowers): after the self-review, ask the user to review the written spec before proceeding to plans. Wait for response.
- **Transition to `writing-plans` is the ONLY post-brainstorming skill** (superpowers): do not jump to implementation, design, mcp, anything. The next skill is plans.

## What we adapt

- **Visual companion** (browser-based mockups, optional per session): superpowers offers it. Keep it as opt-in. Off by default; the user accepts once per session, and even then we decide per-question whether to use the browser or stay in text. Why: the feature is useful but token-intensive and visually-noisy when used unnecessarily.
- **Decomposition gate at the start**: superpowers flags multi-subsystem requests early. We adopt this with stronger wording: a request like "build a platform with chat, file storage, billing, analytics" gets decomposed into sub-projects BEFORE detailed questions. Each sub-project gets its own spec → plan → implementation cycle. Why: this prevented multiple bad outcomes in prior sessions.
- **Spec promotion path**: after spec approval, the next session reads the spec and transitions to plans. We adapt by ensuring the spec includes a "Next session restart point" section pointing at the plans-writing step. Why: enables clean session boundaries (we used this pattern to ship Phase B and Phase C).
- **Composition with `tdd`**: when the design specifies new business behavior, the plan calls `tdd` in strict mode for each behavior. Brainstorming flags this in the spec's "Mode selection" section. Why: prevents the mode question from being re-litigated at implementation time.

## What we reject

- **Trigger filtering / activation gating** (the "skip brainstorming if task estimated < 15 min" idea explored earlier): rejected per project-lead decision. The user can decline manually. YAGNI applies to filtering logic.
- **Implicit design via conversation**: rejected. The spec MUST land on disk in `docs/specs/`. Conversations evaporate; specs persist.
- **Skipping the user-approval gate**: rejected. "It's obvious what the user wants" is a Red Flag — write the design, get approval, then code.
- **Combining brainstorming and planning into one skill**: rejected. They are distinct phases. Brainstorming explores intent + design; planning sequences execution. Different cognitive modes.
- **Jumping directly to implementation skill (frontend-design, mcp-builder, etc.) post-brainstorming**: rejected per superpowers HARD GATE. Always go through `writing-plans` first.

## Hard rules surfaced by this skill

- **HARD GATE: no implementation skill, no code, no scaffolding until spec is written and user approved**. Enforced by: SKILL.md prose + transition checklist + downstream skills checking for spec existence.
- **One question per message**. Enforced by: SKILL.md guidance. (No mechanical hook — this is a discipline rule.)
- **Spec written to `docs/specs/YYYY-MM-DD-<topic>.md` and committed**. Enforced by: SKILL.md transition checklist + `code-review` flags PRs that introduce features without a linked spec.
- **Visual companion offer is its own message** (superpowers) when accepted. Enforced by: SKILL.md guidance.
- **Spec self-review pass before user-review gate**. Enforced by: SKILL.md checklist.
- **Transition to `voidcorp:writing-plans` after user approves spec**. Enforced by: SKILL.md final step + no other transition allowed.

## Modes — none

The discipline is one rigorous process. Section depth scales to project complexity; the GATE never relaxes.

## Companion hooks

None. Brainstorming is a process discipline; the gate is enforced via the SKILL.md and downstream skills checking for spec existence (a `code-review` flag for PRs introducing features without a linked `docs/specs/` file is sufficient).

## Composition with other skills

- **Upstream — `gstack:/office-hours`**: when the user describes a new product idea ("I have an idea..."), invoke office-hours FIRST to validate the idea. Once the idea is validated, brainstorming covers the implementation design.
- **Downstream — `voidcorp:writing-plans`**: the ONLY post-brainstorming transition. Plans turns the approved spec into an executable plan.
- **With `tdd`**: the spec's "Mode selection" section declares the TDD mode per major implementation step. Plans then uses this to sequence the work.
- **With `hexagonal-architecture` + `domain-driven-design`**: for non-trivial designs, these skills inform the section structure (bounded contexts, port/adapter split, aggregates). Brainstorming consumes their vocabulary; does not duplicate their decisions.
- **With `code-review`**: a PR that introduces features without a linked spec gets flagged. Brainstorming's output is the linked spec.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT skip the hard gate. Implementation skills are not invoked, code is not written, until the spec is approved.
- MUST NOT batch multiple questions in one message. One question at a time.
- MUST NOT decide implementation details (those go to plans).
- MUST NOT decide product strategy / scope ambition (those go to office-hours / plan-ceo-review).
- MUST NOT skip the spec-write step "because the conversation is clear." Specs persist; conversations evaporate.
- MUST NOT transition to any skill other than `voidcorp:writing-plans` post-approval.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 350 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions hard gate + one question + 2–3 approaches + spec-write as headline
- [ ] `.source` file lists superpowers + gstack/office-hours + compound-engineering + Boris Cherny
- [ ] No companion hooks needed (the discipline is process)
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/brainstorming/` cover: hard-gate violation detection (writing code without spec approval), one-question-at-a-time enforcement (chat transcript analysis), multi-subsystem decomposition trigger
- [ ] No overlap > 30% with `writing-plans` (this skill = explore + design; plans = sequence execution)
- [ ] No overlap > 30% with gstack `/office-hours` (this skill = how; office-hours = whether)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **Visual companion default**: opt-in per session (current) vs always-off (require explicit `enable visual companion` command). Lean opt-in per session for now; revisit after usage data.
- **Spec template**: provide a starter `docs/specs/TEMPLATE.md` via `voidcorp-harness init`? Lean yes — reduces friction at the first brainstorming session in a new project.
- **Decomposition heuristic**: "multi-subsystem" trigger criteria — count of named subsystems (≥ 3), or also presence of conjunctions ("and"). Lean count-based for now (≥ 3 named subsystems), refine from real cases.
- **Spec self-review automation**: can the self-review pass be partly automated (placeholder scan via regex)? Lean: tiny CLI subcommand `voidcorp-harness spec lint <file>` as a future addition. Not blocking ship.
- **Plans transition mechanics**: explicit user command (`/voidcorp:writing-plans`) vs auto-invocation after spec approval. Lean auto-invocation with a confirmation message. Defer to first 10 real brainstorming sessions.
