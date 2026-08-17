---
skill: plan-review
status: shipped
strategy: distill (5 sources -> 1 skill, 4 lenses + orchestrated mode)
target_loc: 400
actual_loc: 129
activation: on-demand
phase: D
depends_on: []
composes_with: [writing-plans, brainstorming, frontend-design, security-guidance, ticket-runner]
source_ticket: DEV-385
epic: DEV-383
audit_date: 2026-07-10
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `plan-review`

## Need

The gstack teardown (epic DEV-383) removes four plan-review skills (`/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`) and their orchestrator `/autoplan`. Their value is pure methodology: the gates that catch a scope/architecture/edge-case/DX flaw in a *written plan* before it becomes code — an order of magnitude cheaper than catching it in code review. That methodology must survive; the ~7000 LOC of gstack runtime around it must not.

## Decision: one skill with four lenses (not 4-5 skills, not a writing-plans section)

Chosen: a single `harness:plan-review` skill with four lenses (CEO/Eng/Design/DevEx) + an `all` orchestrated mode. Logged in `docs/DECISIONS.md` (2026-07-10, DEV-385). Confirmed with Folpe.

- **One skill = one subject.** The subject is "critique a written plan before execution." The four lenses are dimensions of that one activity — exactly the shape of `code-review` (six dimensions, one skill), not four subjects. Four dedicated skills would be anti-bloat (5 skills), fragment the subject, and force per-pair overlap policing.
- **Not a section in `writing-plans`.** Authoring a plan and adversarially critiquing it from four personas are different subjects; folding the lenses into `writing-plans` would bloat it and create the >30% overlap the ticket explicitly warned against. The boundary is: `writing-plans` authors and owns plan structure/registries; `plan-review` critiques and proposes findings; the author disposes.
- **autoplan is a mode, not a skill.** Once the four lenses live in one skill, "run the four and auto-decide" is a mode (`all`), not a new subject. Porting it as a separate skill would be YAGNI (flagged by the ticket's own edge-case note).
- **`activation: on-demand`.** A plan review is invoked deliberately on an artifact, like `security-audit` — not passive doctrine. Second on-demand skill in core.

## Overlap management (the >30% risk)

The four gstack lenses share a large substrate and overlap each other heavily (CEO∩Eng is the worst — CEO's 11-section rubric nearly contains Eng's 4 sections). Distilling all four verbatim would blow the cross-lens overlap cap. Mitigation:

- **Factored the shared substrate ONCE** into "The shared contract": scope gate, one-finding-one-question, P1/P2/P3 task list, verdict, optional second-opinion. Not repeated per lens.
- **Reduced each lens to its irreducible core**: CEO = premise/ambition/trajectory + alternatives + scope modes; Eng = test-coverage trace + failure modes + buildability; Design = perceived pixels/states/slop; DevEx = TTHW/journey/competitive benchmark. The architectural material CEO and Eng both carried is assigned to Eng (deep) with CEO keeping only premise/trajectory — the clean separation the extraction identified.

## Kept (load-bearing)

The four irreducible lens cores above; the CEO scope modes (the plan-level 10x move, continuous with `brainstorming`'s ambition move); the Eng regression-iron-rule + confidence+quote-the-line gate; the Design interaction-state-coverage + slop classifier; the DevEx TTHW metric + competitive benchmark; the `all` mode's decision taxonomy (Mechanical auto / Taste + User-challenge escalate), the 6 decision principles, cross-lens theme synthesis, and single final gate.

## Rejected (documented)

- **All gstack runtime**: preamble bash, gbrain sync, telemetry, plan-mode detection, the AskUserQuestion D-numbering/completeness-score machinery, Codex-CLI invocation, voice/writing-style, model patches.
- **The named-founder "Cognitive Patterns — How Great {CEOs/Eng Managers/Designers/DX Leaders} Think" rosters** — highest verbatim-copy risk in every source, least load-bearing: the value is the checks, not the Bezos/Grove/Rams/Fowler name-dropping.
- **The `dx-hall-of-fame.md` exemplar corpus** (Stripe/Vercel/Elm code samples) — a calibration reference, not methodology logic.

## Verbatim-copy avoidance

No block > 5 lines matches a source. The distinctive assets (9 Prime Directives, AI-slop blacklist, DX first principles, the 6 decision principles, the decision taxonomy) were paraphrased into the harness's own compact form; sourced ideas (OpenAI delightful-frontends, Krug) are re-cited in `.source`, not pasted.

## Repointing

Live routing references to the gstack plan-reviews (and to `plan-ceo-review` specifically, added in DEV-386) are repointed to `harness:plan-review`: `writing-plans`, `brainstorming`, the skill-decision-matrix, PHILOSOPHY, domain-driven-design. CLAUDE.md/AGENTS.md skill-routing updated in the same commit. Provenance (cartography, the 2026-05-29 design snapshot, backlog-autopilot plans/workflow) keeps the historical names.

## Verification

Anti-bloat (129 LOC ≤ 400, desc 181 ≤ 200, name==folder, `.source` + this note), core-assets mirror, graph regen, full test suite, CLAUDE.md↔AGENTS.md parity. Behavioral eval deferred to DEV-397 (a plan critique is a conversational artifact the v1 eval harness cannot score; a head-to-head candidate once DEV-397 lands).
