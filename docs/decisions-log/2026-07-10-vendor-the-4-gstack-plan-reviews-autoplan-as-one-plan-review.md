---
date: 2026-07-10
title: "vendor the 4 gstack plan-reviews + autoplan as ONE plan-review skill with four lenses (DEV-385)"
---

## 2026-07-10: vendor the 4 gstack plan-reviews + autoplan as ONE plan-review skill with four lenses (DEV-385)

De-gstackification Vague 1 (epic DEV-383). The teardown removes `/plan-ceo-review`, `/plan-eng-review`,
`/plan-design-review`, `/plan-devex-review`, and their orchestrator `/autoplan` (~7000 LOC of source). Their
methodology — the gates that catch a scope/architecture/edge-case/DX flaw in a *written plan* before it
becomes code — is load-bearing and must survive.

Decision (confirmed with Folpe): a single `harness:plan-review` skill with four lenses (CEO / Eng / Design /
DevEx) + an `all` orchestrated mode, NOT 4-5 dedicated skills and NOT a section inside `writing-plans`.

Load-bearing choices:
- **One skill = one subject.** The subject is "critique a written plan before execution"; the four lenses are
  dimensions of it — exactly the shape of `code-review` (six dimensions, one skill). Four dedicated skills
  would be anti-bloat, fragment the subject, and force per-pair overlap policing. A `writing-plans` section
  was rejected: authoring a plan and adversarially critiquing it from four personas are different subjects, and
  folding would create the >30% overlap the ticket warned against. Boundary: `writing-plans` authors and owns
  plan structure/registries; `plan-review` critiques and proposes findings; the author disposes.
- **autoplan dissolves into the `all` mode**, not a separate skill (YAGNI): once the lenses are one skill, "run
  the four and auto-decide" is a mode. Its real value survives — the decision taxonomy (auto-decide Mechanical
  only; Taste + User-challenge escalate), the 6 decision principles, cross-lens theme synthesis, single gate.
- **Overlap management.** The gstack lenses overlap heavily (CEO's rubric nearly contained Eng's). The shared
  substrate (scope gate, one-finding-one-question, task list, verdict, second-opinion) is factored ONCE; each
  lens is cut to its irreducible core (CEO premise/ambition/trajectory; Eng test-coverage trace + failure
  modes; Design perceived pixels/states/slop; DevEx TTHW/journey/benchmark) to stay under the 30% cap.
- **`activation: on-demand`** — invoked deliberately on an artifact, like `security-audit`. Distilled 5 sources
  (~7000 LOC) into 129 LOC. Rejected: all gstack runtime, and the named-founder "how great X think" rosters
  (highest copy-risk, least load-bearing — the value is the checks, not the name-dropping).

Why: the plan-review gates are ~an order of magnitude cheaper than finding the same flaw in code review; losing
them at teardown would be a real regression. One consolidated skill keeps the methodology, respects anti-bloat,
and gives the CEO lens's scope-EXPANSION mode a home (the plan-level continuation of brainstorming's 10x move).
