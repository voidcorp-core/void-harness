---
date: 2026-06-04
title: "four new core skills + the Rationalizations/Verification section standard"
---

## 2026-06-04: four new core skills + the Rationalizations/Verification section standard

Context: research across anthropics/skills, the Claude Code creators' interviews, and
the best-practice corpus surfaced gaps not yet covered by the 22 core skills.

Decision: add `source-driven-development` (read official docs for the installed
version before writing config; cite the source), `context-management` (the window is
the core constraint: clear, compact, two-correction reset, fresh-context subagents,
state on disk), `compounding` (end-of-cycle ritual: name the reusable pattern and
route it via capture-rule / harness-evolution), and `api-and-interface-design`
(contract-first public interfaces, minimal surface, versioning). New skills adopt a
`## Rationalizations` table (pre-empts the model's excuses to skip the skill) and a
`## Verification` proof-gate as the standard anatomy.

Alternatives rejected:
- Retrofit the Rationalizations/Verification sections into all 22 existing skills
  now: large diff, rewrites authored voice broadly. Set the standard in new skills;
  backfill opportunistically.
- A full `writing-skills`/skill-creator port (to replace the superpowers pointer):
  high value but a larger effort; deferred as a tracked follow-up.
