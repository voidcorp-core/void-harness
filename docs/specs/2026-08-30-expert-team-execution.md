---
title: An expert team that challenges before it writes
date: 2026-08-30
status: in-design
author: Folpe + Claude
ticket:
related:
  - docs/specs/2026-07-24-void-harness-v3-top-tier-engineering-team.md
  - docs/decisions-log/2026-07-26-event-sourced-team-review-controller--5a59e1f3-a837-44d4-9d53-0819e46ad19e.md
  - docs/decisions-log/2026-08-28-union-is-read-before-it-merges--053e6114-d596-4ef5-bb2d-7109bcaa4533.md
---

# An expert team that challenges before it writes

## Why

The harness already owns the pieces of an expert team and does not convene it.

Sixteen canonical specialists are compiled to native agents for both runtimes —
`security-engineer`, `solution-architect`, `test-qa-engineer`, `performance-engineer`,
`product-challenger` and eleven more. `void-implement` names **five**, all of them light
critics: `doctrine-critic`, `silent-failure-hunter`, `type-design-analyzer`, `code-explorer`,
`migration-planner`. The panel exists; the cycle does not call it.

The consequences are measured, not supposed. In one session on 2026-08-29:

| defect | caught by | should have been |
|---|---|---|
| an accepted decision re-litigated, though the ticket cited it | the union reading | pass 1 |
| a design resting on an enforcement that did not exist (`grep -c "void-"` → 0) | the union reading | the pass that wrote it |
| a shipped skill asserting the opposite of the CLI, for days | a backlog audit | a test that did not exist |
| a guard that would have blocked the autonomy it was protecting | the human | a measurement before writing |

Three of the four share one cause: **a written claim was never confronted with reality**. Code
has tests; prose has nothing, unless somebody reads it trying to refute it.

## What this changes

### The cycle becomes brief-first

```
1. INGEST    the unit, and everything it cites — decisions included
2. BRIEF     parallel dispatch to the specialists the predicates select
             each challenges its own angle, before any line is written
             each returns its findings AND how it will verify them
3. WRITE     one lead writer implements against that brief
4. VERIFY    adversarial review, dogfood, gates
5. RECAP     every specialist choice surfaces, named
```

**One writer, many readers.** The 2026-07-26 decision already settled it — "one lead writer
owns all mutations" — and the research is unambiguous: writes need sequential coordination,
reads parallelise naturally, and merging independently generated work produces the
*Frankenstein effect*, degrading structural coherence more than a simpler single-shot
approach. A specialist challenging is a read. So the panel is parallel and the pen is not.

**The brief carries its own acceptance criteria.** This is the part that buys speed rather
than spending it. A specialist does not only say "watch out for X"; it says how it will check
X. The writer implements against those criteria and verifies itself, so the review afterwards
confirms instead of discovering. One full round trip disappears, and a writer who knows what
it will be judged on does not write the same code.

**A refusal comes with options and a choice.** A specialist that says no proposes the
alternatives, picks the best one, and that choice surfaces in the final recap. It never
silently blocks: under a 6h unattended run, a block stops the chain while a named choice does
not.

### The floor is the panel, the variable is depth

Every ticket convenes the panel. What scales with the work is how deep each answer goes, never
who is consulted — a panel that fires only sometimes is a panel nobody trusts. On an XS ticket
`security-engineer` answers "no trust boundary touched" in three lines. That is not a reduced
panel, it is a fast one.

This is affordable only if the specialists read a compiled context pack rather than each
exploring the repository. That is DEV-443, and it is the prerequisite for the panel's speed
rather than a nice-to-have.

### The x10 moves to brainstorm, and fires every time

`void-brainstorm` has a "10x move" section and it is trapped inside the *raw product idea*
mode, so it never fires for a technical ticket. It becomes unconditional: every brainstorm
pushes the ambition before settling, so the spec — and the ticket derived from it — is already
the optimal version.

`void-implement` therefore does not re-open scope. Its specialists challenge **how** the thing
is built, never **what** is built. An angle found genuinely wrong returns to brainstorm, which
is a rare and named event rather than a per-ticket re-litigation.

### Autopilot: sequential, and measured against its own drift

The parallel cluster is replaced by a sequential chain: union branch, then one feature branch
per unit, each merged into the union, then consolidation and one PR to `develop`. The research
is direct — parallel merge breaks on semantic conflicts, which no tooling resolves
automatically, and this repository saw two artifact conflicts in five supposedly disjoint
tickets on 2026-08-29. Sequencing removes the entire class.

The chain is bounded by **time**, not by a ticket count: `chainBudget`, two hours by default.
An invocation may shorten one run and never lengthen it, because the declaration is the consent
to run unattended. It stops at the first failure without starting the next unit; an unverified
base, and one verified on a tree other than the merge it just produced, both stop it exactly
like a red one.

**And it watches for drift.** SlopCodeBench measures what happens when an agent repeatedly
extends its own previous work: quality degrades across rounds in a way single-shot checks do
not see. A run chaining units for six hours is that exact shape. So the chain does not only ask
"is the base green" — it asks whether the work is still as good as it was, and stops when it is
not. The apparatus exists (`apps/eval-harness`, `gut-skill.ts`, `--sensitivity`); this points
it at the run rather than at the skill.

## The design principles gap

Measured across `packages/core/skills/*/SKILL.md`:

| principle | where it lives today | verdict |
|---|---|---|
| Dependency inversion | `void-hexagonal-architecture` | covered |
| DRY | named in 16 skills, owned by none | dispersed |
| KISS | named in 8, owned by none | dispersed |
| Single responsibility | `void-brainstorm` only | gap |
| Cohesion | nowhere | total gap |
| Coupling | 4 skills, in passing | not owned |
| Open/closed, Liskov, interface segregation | nowhere | gaps |

DRY is the worst case: named everywhere, owned nowhere, and its ubiquity creates the illusion
of coverage.

**One skill, not five.** The deciding criterion is not breadth but trigger time: these
principles all fire at the same instant — "I am writing code". Five skills would mean five
loads for one moment, four of them distractors each time, and the research is explicit that an
irrelevant skill does not sit idle, it actively misleads. One skill, `void-design-principles`,
loaded once at that moment.

It carries only what is **actionable and verifiable**. The literature is clear that these
principles deliver nothing on their own — they require a modular architecture, automated
testing and governance around them, all of which this harness already has. So the skill states
what a reviewer can point at, and slogans are left out. Anything mechanically checkable becomes
a hook rather than prose.

Dependency inversion stays in `void-hexagonal-architecture`: it is already owned, and the
anti-bloat rule forbids more than 30% overlap between two skills.

## Where the reasoning came from

Recorded because the conclusions are useless without the arguments that produced them, and
because two of them overturned what was about to be built.

- **One writer, many readers** — [When Parallelism Pays Off](https://arxiv.org/pdf/2606.00953),
  [LLM Consortium for Software Design Refinement](https://arxiv.org/pdf/2606.01490),
  [Single-Agent vs Multi-Agent AI](https://www.augmentcode.com/guides/single-agent-vs-multi-agent-ai).
  Writes need sequential coordination, reads parallelise, and merging independently generated
  work degrades structural coherence more than a simpler single-shot approach. This is what
  ruled out "each role writes its own part", which was the intuition being considered.
- **Sequential integration** — the same sources: parallel merge breaks on semantic conflicts,
  where both sides compile alone and fail together, and no tooling resolves them.
- **One skill, not five, for design principles** — [Building skills for AI agents](https://next.redhat.com/2026/07/28/building-skills-for-ai-agents-pitfalls-and-best-practices/),
  [Organizing and Benchmarking Agent Skills at Ecosystem Scale](https://arxiv.org/pdf/2603.02176).
  Narrow skills beat broad ones in general — but an irrelevant loaded skill *actively misleads*
  rather than idling, and these principles all fire at one instant. This is the argument that
  reversed the first recommendation, which had been to group them for convenience.
- **Long-horizon drift** — [SlopCodeBench](https://arxiv.org/html/2603.24755v1). Quality
  degrades as an agent extends its own previous work across rounds, and single-shot checks do
  not see it.
- **The measured facts of 2026-08-29/30** are in DEV-666 (63 verdicts), DEV-667 (five
  mechanisms that never fired), DEV-668 (principle coverage), DEV-669 (missing specialists).

## Acceptance criteria

- [ ] `void-implement` convenes the predicate-selected specialists **before** the first line, in parallel, and names them.
- [ ] Each specialist returns findings and the criteria it will verify; the writer implements against them.
- [ ] A specialist refusal carries options, a chosen one, and surfaces in the recap.
- [ ] One lead writer performs every mutation; no reviewer edits.
- [ ] The panel is a floor: no ticket skips it, and depth is what varies.
- [ ] `void-brainstorm` pushes the x10 on every brainstorm, not only on a raw product idea.
- [ ] `void-implement` never re-opens scope; a wrong angle returns to brainstorm explicitly.
- [ ] `void-autopilot` chains sequentially through a union branch, bounded by `chainBudget`.
- [ ] The chain stops on a red base, an unverified base, a spent budget, or measured drift.
- [ ] `void-design-principles` exists, owns SRP/OCP/LSP/ISP/DRY/KISS/cohesion/coupling, and overlaps no existing skill by more than 30%.
- [ ] Every principle in it is actionable; anything mechanical is a hook instead.
- [ ] Skills stay under 400 lines and the cycle stays readable.

## Failure modes to design against

* **The panel becomes theatre.** Sixteen specialists answering "nothing to report" teaches everyone to skip reading them. Each must be able to return *nothing* cheaply and visibly, and a specialist that never changes an outcome across a measured window is a candidate for removal — the eval apparatus decides, not taste.
* **The brief becomes a second ticket.** If specialists restate scope, two documents drift and a unit gets a different standard depending on which was read. The brief is about execution only.
* **Depth collapses to nothing.** "Fast" must not become "silent": a three-line answer still states what was examined.
* **Drift detection fires on noise.** A flaky suite would stop every chain. The measure must be about the work produced, not about test stability.
* **The principles skill becomes a lecture.** Prose nobody can point at during review is prose nobody applies — which is precisely DRY's current condition.

## TDD mode

Strict for the deterministic core (brief composition, chain decisions, drift threshold). The
skills are prose held by tests asserting their load-bearing clauses, as
`test/skills/autopilot-describes-its-gate.test.ts` already does.
