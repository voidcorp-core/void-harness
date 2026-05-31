---
name: brainstorming
description: Explore intent before code. One question at a time, 2-3 approaches, design section-by-section, spec written and approved, transition to writing-plans. HARD GATE — no code until spec approved.
---

# brainstorming — voidcorp craftsman edition

Start by understanding the project context. Then ask questions one at a time to refine the idea. Once you understand what is being built, present the design in sections, get approval, write the spec to `docs/specs/`, and transition to `void:writing-plans`. **No implementation skill, no code, no scaffolding until the spec is written and approved.**

**Attribution**: see `.source`. Primary source: superpowers/brainstorming, adapted for void-harness.

---

## HARD GATE

Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until:

1. The spec is written to `docs/specs/YYYY-MM-DD-<topic>.md`
2. The spec has passed self-review
3. The user has explicitly approved the written spec

**This applies to EVERY project, regardless of perceived simplicity.**

The anti-pattern is "this is too simple to need a design." Every project goes through this process. Simple projects' specs are short (a few sentences for truly trivial ones), but they MUST be written and approved.

---

## Process

### Step 1 — Explore project context

Check the current state: existing files, `docs/`, recent commits, related specs in `docs/specs/`. If a similar spec exists, reference it.

### Step 2 — Scope check (multi-subsystem decomposition)

If the request describes multiple independent subsystems ("build a platform with chat, file storage, billing, analytics"), flag this immediately. Help the user decompose into sub-projects:

- What are the independent pieces?
- How do they relate?
- What order should they be built?

Each sub-project gets its own spec → plan → implementation cycle. Brainstorm the first sub-project through the normal flow.

### Step 3 — Visual companion offer (optional, opt-in)

If upcoming questions will involve visual content (mockups, layouts, diagrams), offer the browser-based companion ONCE for consent. The offer is its OWN message — do not combine with clarifying questions.

```
"Some of what we are working on might be easier to explain if I can show it
to you in a web browser. I can put together mockups, diagrams, comparisons.
This feature is new and can be token-intensive. Want to try it? (Requires
opening a local URL.)"
```

Wait for the user's response. If they decline, proceed in text-only.

### Step 4 — Ask clarifying questions

- One question at a time. Never batch.
- Multi-choice preferred when applicable (2–4 distinct mutually-exclusive options with brief descriptions and a recommended option labeled).
- Open-ended fine when no obvious options exist.
- Focus on: purpose, constraints, success criteria.

### Step 5 — Propose 2–3 approaches

Present alternatives conversationally with trade-offs. Lead with the recommendation and the reason. Let the user redirect.

### Step 6 — Present the design

Once the intent is clear, present the design in sections:

- Architecture
- Components
- Data flow
- Error handling
- Testing approach
- Rollout / phases (if non-trivial)
- TDD mode per implementation phase (strict / souple / exploratory — composes with `tdd` skill)

Get approval AFTER each section before moving on. Scale each section to its complexity: a few sentences for simple projects, 200–300 words for nuanced ones.

### Step 7 — Write the spec

Write to `docs/specs/YYYY-MM-DD-<topic>.md` and commit. Frontmatter:

```yaml
---
title: <topic>
date: YYYY-MM-DD
status: in-design  # → approved
author: <user> + Claude/Codex
related: [...]
---
```

### Step 8 — Spec self-review pass

Read the spec with fresh eyes:

1. **Placeholder scan** — any "TBD", "TODO", incomplete sections, vague requirements? Fix.
2. **Internal consistency** — do sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check** — is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check** — could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix issues inline. No need to re-review — just fix and move on.

### Step 9 — User reviews the written spec

Ask the user to review the spec file before proceeding:

> "Spec written and committed to `docs/specs/<file>.md`. Please review and let me know if you want changes before we start the implementation plan."

Wait for the user's response. If they request changes, make them and re-run self-review. Only proceed once the user approves.

### Step 10 — Transition to `void:writing-plans`

The ONLY post-brainstorming transition. Invoke writing-plans. Do not invoke any other skill (frontend-design, mcp-builder, etc.).

---

## Design principles

### Design for isolation and clarity

- Break the system into smaller units, each with one clear purpose.
- Communicate through well-defined interfaces.
- Each unit can be understood and tested independently.
- For each unit, answer: what does it do, how do you use it, what does it depend on?

Smaller, well-bounded units are easier to work with — easier for the agent to hold in context, more reliable edits.

### Existing codebases

- Explore current structure before proposing changes.
- Follow existing patterns.
- Improve adjacent code only where it serves the current goal (no unrelated refactoring).

---

## Red Flags — thoughts that mean STOP

| Thought | Reality |
|---|---|
| "This is too simple to need a design" | The gate applies to every project. Write the short version. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Sure, but the design discipline still applies. |
| "I can check git/files quickly" | Files lack conversation context. Stay in the process. |
| "Let me gather information first" | Process telling you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. |

---

## Key principles

- **One question at a time.** Never overwhelm with multiple.
- **Multi-choice preferred.** Easier to answer than open-ended.
- **YAGNI ruthlessly.** Remove unnecessary features from all designs.
- **Explore alternatives.** Always propose 2–3 approaches before settling.
- **Incremental validation.** Present design, get approval before moving on.
- **Be flexible.** Go back and clarify when something doesn't make sense.

---

## Composition with other skills

- **Upstream — `gstack:/office-hours`**: when the user describes a new product idea ("I have an idea..."), invoke `/office-hours` first to validate the idea. Once validated, this skill covers the implementation design.
- **Downstream — `void:writing-plans`**: the ONLY post-brainstorming transition.
- **With `tdd`**: the spec declares the TDD mode for each major implementation step. Plans then uses this.
- **With `hexagonal-architecture` + `domain-driven-design`**: these skills inform the design's structure (bounded contexts, ports, aggregates). Brainstorming consumes their vocabulary; does not duplicate their decisions.
- **With `code-review`**: a PR that introduces features without a linked spec gets flagged.

---

## Anti-rules

- MUST NOT skip the hard gate.
- MUST NOT batch multiple questions in one message.
- MUST NOT decide implementation details (those go to plans).
- MUST NOT decide product strategy / scope ambition (those go to office-hours / plan-ceo-review).
- MUST NOT skip the spec-write step "because the conversation is clear."
- MUST NOT transition to any skill other than `void:writing-plans` post-approval.

---

## Final rule

```
Idea → questions → 2–3 approaches → design in sections → spec written → self-review → user approves → writing-plans.
Otherwise → it is not voidcorp brainstorming.
```

The hard gate exists because LLM agents write very fast code for very wrong problems. The discipline pays for itself in the first project that does not have to be rewritten.
