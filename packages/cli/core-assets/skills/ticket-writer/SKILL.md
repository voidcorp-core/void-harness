---
name: ticket-writer
description: Use when turning a finished brainstorm, plan, or design decision into a tracker ticket. Triggers on creating a ticket or issue, logging work, or breaking an approved spec into tickets.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
---

# ticket-writer

A ticket an implementation agent can execute with zero follow-up questions. It does NOT invent scope: it ingests what was already decided (the brainstorm, the plan, this conversation, the relevant ADR) and renders it as a complete, estimated, labeled work item in the tracker. Downstream, `harness:ticket-runner` executes it.

**Core principle:** the ticket is the contract between the thinking and the building. Every required slot is filled or the ticket is not ready. Estimate and labels are not optional metadata, they are how the backlog stays pilotable.

**Attribution**: see `.source`.

---

## When to invoke

- After `harness:brainstorming` or `harness:writing-plans` produced a decision or spec, to capture it as trackable work.
- When the user says create a ticket, log this, or break this into tickets.
- Always writes to the project's tracker (Linear / Jira / GitHub / ...). On a project with a fixed tracker, team, and label conventions, use them and do not re-ask.

Do NOT use this to execute a ticket (`harness:ticket-runner`) or to sequence many steps (`harness:writing-plans`).

---

## Ingest first, do not invent

Pull from what already exists, in order: the approved spec/plan, the brainstorm decisions, this conversation's decisions, the applicable ADR(s), the code conventions. The ticket RECORDS decisions already made. If a load-bearing decision is missing, go get it or flag it. Do not guess scope into existence.

A `docs/specs/*.md` spec with `source: forge` in its frontmatter (the forge→harness artifact contract; see `docs/ARCHITECTURE.md` "Inter-plugin contracts") is a first-class source: its 18 recon variables, winning design, and critique verdict already answer scope, persona, and constraints — ingest them, do not re-ask. A partial forge spec (missing critique, or an older `forge_version` field) is ingested for what it has, with the gaps listed as the ticket's open questions.

---

## The ticket: required slots

Render into the tracker description. Every slot is REQUIRED unless marked optional. A missing required slot means the ticket is not ready.

- **Title**: `[Verb] [Subject]`, imperative.
- **Context**: why it exists; link to the broader goal / spec / ADR.
- **Scope**: in scope / out of scope.
- **Technical specs**: files and packages touched, applicable ADR, conventions and patterns to follow, third-party docs to ground in. Exhaustive enough that no unknown remains.
- **Acceptance criteria**: objectively verifiable checkboxes.
- **Definition of Done**: tests written and green, 0 lint / type errors, 0 regressions, plus ticket-specific items.
- **Edge cases and gotchas**: boundary behaviors, error / empty / loading states, failure modes. This is the all-angles slot; an empty one means angles were missed.
- **TDD mode**: defer to `harness:tdd`'s path-based auto-selection; note an explicit override to strict only for a business-critical surface (auth, payments, security, money).
- **Runner passes that apply**: which `harness:ticket-runner` conditional passes you expect to fire (architecture? migration safety? async/idempotency? E2E? UX/UI? deep security?). This is an accelerator HINT, not authoritative: the runner still evaluates every predicate itself and may add passes you did not list.

Native tracker fields (REQUIRED, set the real field, not prose):

- **Estimate** (points / size). Never leave empty.
- **Labels** (at least one; reuse existing, create if genuinely new).
- **Parent epic / project** link.
- **Dependencies** (`blockedBy`) in the native field, not just text.
- **Priority**.

---

## All-angles sweep before saving

Run a quick expert sweep so nothing is missed, then fold what surfaces into Edge cases or the applicable-passes slot:

- **Architecture**: boundaries, data model, public types.
- **Data / migrations**: schema change, backfill, zero-downtime (flags the runner's migration-safety pass).
- **Security**: trust boundary, untrusted input, tenancy.
- **Async / idempotency**: email, webhook, job, single-use token, replay (flags the runner's async pass).
- **QA**: edge / error / empty states, the end-to-end path.
- **UX**: if a UI surface is involved.
- **Perf / observability / docs**: cost, logging, doc updates owed in the same change.

This is the cheap insurance an expert team would not skip. It is what makes a ticket cover the angles the author would not have thought of alone.

---

## Sizing

Map T-shirt to the tracker's native scale: XS (<1h, trivial), S (1-3h), M (3-8h, minor unknowns), L (1-2d, real complexity), XL (>2d, split unless truly indivisible).

---

## Red flags: STOP, the ticket is not ready

| Rationalization | Reality |
|-----------------|---------|
| "I will add the estimate later" | Estimate is a required field. An unestimated backlog cannot be planned. |
| "Labels do not matter for now" | At least one label, always. Filtering and routing depend on it. |
| "The agent will figure out the edges" | The edge-cases slot is where all-angles coverage lives. Empty = angles missed. |
| "Scope is obvious from the title" | The implementation agent has none of this conversation. Spell it out. |
| "No parent, it is standalone" | Orphan tickets rot. Link the epic or project. |

A ticket missing a required slot or field is not done, however clear it feels.

---

## Composition

Upstream: `harness:brainstorming` and `harness:writing-plans` produced the thinking (or a `source: forge` spec did — see "Ingest first"); this skill captures it. Downstream: `harness:ticket-runner` consumes the ticket and the passes it declares. On a project, follow that project's tracker doctrine (team, project, label and estimate conventions) rather than re-deciding them here; this skill stays the harness-doctrine layer (ingest, required slots, runner handoff).
