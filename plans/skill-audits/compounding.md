---
skill: compounding
status: draft
strategy: distill
target_loc: 200
phase: D
depends_on: []
composes_with: [capture-rule, harness-evolution, verification-before-completion, code-review]
matrix_row: plans/skill-decision-matrix.md#compounding
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `compounding`

## Need

Without `compounding`, finished work teaches nothing durable. You fix the bug, merge, and move on; the *lesson* (the generalizable pattern, not the one-line fix) evaporates with the context. The next cycle re-discovers the same friction from scratch. This skill is the two-minute end-of-cycle ritual that names the learned pattern, decides whether it is a project rule, a harness gap, or disposable, and routes it to the skill that owns that destination. Without it, the harness gets *used* more but does not get *sharper* — the compounding loop never closes.

## Decision matrix anchor

Proposed cells for `plans/skill-decision-matrix.md#compounding` (the matrix is a shared file; this row is added in a separate, non-shared change). Quoted here for governance:

- **Wins**: at cycle close (merged feature / bugfix / refactor) or on a "deja vu" recurring fix, when a reusable pattern was learned and needs triage before the context is lost.
- **Loses to**: `capture-rule` when the user already states a known project rule with no extraction needed (route straight there); `harness-evolution` for the actual feedback/audit machinery.
- **Cannot decide**: whether the routed lesson is adopted — the destination skill's HITL gate decides. compounding never writes doctrine.
- **Composes with**: `capture-rule` (project-scoped destination), `harness-evolution` mode `feedback` (harness-scoped destination), `verification-before-completion` (upstream — cycle must be verified done), `code-review` (recurring findings are a "deja vu" signal).

These cells govern. If the per-skill content drifts from the matrix, fix one or the other, never let them diverge silently.

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| EveryInc/compound-engineering-plugin | https://github.com/EveryInc/compound-engineering-plugin | reviewed | Principle kept ("each unit of work makes the next easier"); command namespace and artifact store rejected. |
| Every "compound engineering" concept | (Every essays / Kieran Klaassen) | reviewed | Kept as the framing rationale for the end-of-cycle ritual. |
| void-harness `capture-rule` (in-repo) | packages/core/skills/capture-rule/ | reviewed | Boundary reference — downstream destination, not duplicated. |
| void-harness `harness-evolution` (in-repo) | packages/core/skills/harness-evolution/ | reviewed | Boundary reference — downstream destination, not duplicated. |

## Adaptation strategy

`distill`. Extract the load-bearing principle (compounding work + capture-at-cycle-close) from the Every plugin, then rewrite from scratch as a *routing ritual* that feeds the two existing void-harness skills, rather than re-implementing a standalone capture mechanism. The value void-harness adds is the explicit triage (project / harness / disposable) and the anti-capitalization discipline.

## What we keep (verbatim or near-verbatim)

- The core claim, paraphrased: "each unit of work should make the next one easier." Source: Every compound-engineering. Reworded, not copied.
- The end-of-cycle capture *moment* as the natural trigger point.

## What we adapt

- **Capture target**: changed from the plugin's own artifact store to *routing into existing void-harness skills* (`capture-rule` / `harness-evolution`). Why: void-harness already has two HITL-gated destinations; a third store would fragment and duplicate them.
- **Trigger**: added the explicit "deja vu" recurrence signal alongside cycle-close. Why: recurring friction is the strongest evidence a pattern exists and was never captured.
- **Pattern vs instance**: made the generalization step (Step 1) a hard gate — no generalization, no capture. Why: instances are noise; only patterns compound.

## What we reject

- **The `/ce-*` command namespace**: rejected. Why: void-harness relies on skill auto-discovery from the frontmatter `description`, not a bespoke command prefix. A `/ce-*` namespace would be a parallel invocation convention that contradicts the harness's routing model.
- **A per-cycle `STRATEGY.md` artifact**: rejected. Why: void-harness already routes durable lessons to `.void/PROJECT-DOCTRINE.md` (project) or `.void/harness-feedback/proposed/` (harness). A third `STRATEGY.md` store would duplicate those, drift from them, and bloat the doctrine — exactly the anti-bloat failure the repo guards against.
- **Auto-applying captured lessons**: rejected. Why: HITL is absolute across the harness. Every capture passes a human gate in its owner skill.

## Hard rules surfaced by this skill

- **Name the pattern, not the instance**: a capture requires a one-sentence generalization. Enforced by: SKILL.md Step 1 gate + Verification checklist.
- **Route, never write**: compounding never writes doctrine; it delegates to `capture-rule` or `harness-evolution`. Enforced by: SKILL.md Anti-rules + Boundary section.
- **No capitalization of trivial instances**: disposable lessons are dropped. Enforced by: SKILL.md "When to drop it" section + Rationalizations table.

## Modes (if applicable)

None. Single ritual; the branch is the routing decision (project / harness / disposable), not a mode.

## Companion hooks

None planned. The ritual is judgment-driven and bounded at two minutes; a hook would either fire too often (every merge) or add false positives. Obsolescence of unused captures is already covered by `harness-evolution` mode `audit`.

## Composition with other skills

- **Downstream `capture-rule`**: project-scoped patterns are handed to it; it owns the wording proposal and the PROJECT-DOCTRINE.md write + HITL gate.
- **Downstream `harness-evolution` (mode `feedback`)**: harness-scoped gaps are written as proposals in that skill's frontmatter format; it owns the CLI promotion + PR flow.
- **Upstream `verification-before-completion`**: the cycle must be verified done before the ritual runs.
- **Side signal `code-review`**: a recurring review finding is a "deja vu" trigger.

Shared state: none owned by this skill. It reads the same scope heuristic as `capture-rule` ("would this apply to a new unrelated project?") to keep routing decisions consistent.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT write into `.void/PROJECT-DOCTRINE.md` directly — route to `capture-rule`.
- MUST NOT open or promote a harness PR directly — route to `harness-evolution`.
- MUST NOT reimplement the feedback proposal format, the CLI, or the audit.
- MUST NOT capitalize trivial / one-off instances.
- MUST NOT auto-apply any captured lesson.
- MUST NOT run on an unfinished cycle.

## Verification checklist for shipping this skill

- [x] SKILL.md drafted at target LOC, ≤ 400 hard cap (153 lines)
- [x] Frontmatter `description` ≤ 200 chars, precise for auto-discovery
- [x] `.source` file lists every audited source with URL
- [ ] Companion hooks (if any) — none planned, documented above
- [ ] Matrix row added in `plans/skill-decision-matrix.md` (separate change — shared file)
- [ ] Skill test in `test/compounding/` produces expected output on at least 2 fixtures
- [x] No overlap > 30% with another existing skill (explicit Boundary section vs capture-rule + harness-evolution)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor (handled in shared-doc change)
- [ ] Audit note status moved from `draft` → `reviewed` after user review

## Open questions

- Should the "deja vu" trigger eventually be surfaced by `code-review` automatically (a finding seen across N PRs), or stay a manual judgment call? Defer until usage data exists.
- Does the two-minute bound need any soft enforcement, or is documenting it enough? Likely enough.
