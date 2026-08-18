# Skill audit — learn

**Status**: authored 2026-07-09 (issue #75), fusing `compounding` + `capture-rule` + `harness-evolution`.

## Why fuse

The three source skills were 563 lines, of which ~200 were mutual boundary-policing: `compounding`'s "Boundary — compounding vs capture-rule vs harness-evolution" table and anti-rules, `capture-rule`'s "Project rule vs universal rule" pre-step routing to `harness-evolution`, and `harness-evolution`'s "Agnostic vs project-specific" gate routing back to `capture-rule`. Three doors to one intent — *capture a lesson* — each spending prose defending its edge against the other two. Auto-discovery had to choose between three descriptions for the same trigger family, which is exactly the ambiguity that produces the wrong pick.

Fusing removes the boundaries (there is nothing to police once they are one skill) and makes the routing decision the explicit first step instead of a per-skill defensive preamble.

## What was preserved (behavior-identical)

- **Branch A (project rule)** — capture-rule's full HITL procedure: propose wording → wait for explicit yes → write to `.void/PROJECT-DOCTRINE.md` → confirm; section routing table; duplicate/conflict handling. Unchanged.
- **Branch B (harness gap)** — harness-evolution's filing bar (agnostic + harness-worthy), `gh issue create` flow, triage-on-tracker (no queue, no `feedback push`), and the audit-report interpretation. Unchanged; the audit *machinery* stays in the CLI.
- **Branch C (end-of-cycle ritual)** — compounding's "name the pattern not the instance", scope decision, and route-or-drop, plus the anti-capitalization "when to drop" discipline. Unchanged.
- HITL is absolute in every branch; no auto-write; nothing merged without review.

## What was cut

- The three inter-skill boundary tables and rule-of-thumb paragraphs (~200 lines). Redundant once merged.
- Duplicated "when in doubt, ask" prompts (three copies → one, in Step 1).
- The `usage.log` privacy paragraph (superseded by `.void/activations.jsonl`, #70).

## Rejected: a Stop nudge hook

The ticket asked to *evaluate* a Stop hook that detects cycle close (merge / PR closed in the session) and nudges the capture. Rejected: the Stop hook payload carries no session-start timestamp and no merge/PR signal, so "a cycle just closed" is not reliably detectable from it — a `git log` probe would fire on every session that ever touched a merge commit. A nudge that misfires trains the user to ignore it, which is worse than no nudge. The broad frontmatter description + the auto-trigger signal list (Step 0) are the primary discovery mechanism; if telemetry later shows the skill is under-firing at cycle close, revisit with a signal that actually exists (e.g. a post-merge git hook in the consumer, out of this skill's scope).

## Anti-bloat

209 lines (cap 400), description 194 chars (cap 200). One subject (capture a lesson), three destinations — not three subjects.
