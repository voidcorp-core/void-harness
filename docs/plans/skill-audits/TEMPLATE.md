---
skill: <skill-name>
status: draft  # draft | reviewed | shipped | deprecated
strategy: <port-DECLIK | distill | compose-gstack | original | vendor-plugin>
target_loc: <number, hard cap 400>
phase: <A | B | C | D | E>  # internal execution phase (see Section 0bis.6 of the design spec)
depends_on: [<skill>, <skill>, ...]
composes_with: [<skill>, <skill>, ...]
matrix_row: plans/skill-decision-matrix.md#<skill-name>
audit_date: YYYY-MM-DD
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `<skill-name>`

## Need

One paragraph. What this skill exists to ensure. The concrete pain it prevents in the absence of any such skill. If the user cannot answer "what would go wrong without this?" in two sentences, the skill should not exist.

## Decision matrix anchor

Quote the relevant cells from `plans/skill-decision-matrix.md`:

- **Wins**: ...
- **Loses to**: ...
- **Cannot decide**: ...
- **Composes with**: ...

These cells govern. If the per-skill content drifts from the matrix, fix the matrix or fix the content, but never let them diverge silently.

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| <name> | <url> | <read / skimmed> | <kept / partially kept / rejected and why> |
| ... | ... | ... | ... |

## Adaptation strategy

Pick one (matches the master table):

- **`port-DECLIK`** — the DECLIK version is already top-5%. We lift the SKILL.md with the minimal stack-agnostic adaptations listed below.
- **`distill`** — extract the load-bearing principles from the audited sources, rewrite from scratch, attribute in the prologue and in the `.source` file.
- **`compose-gstack`** — wrap or sequence existing gstack commands. The void-harness skill becomes a thin orchestration layer with the discipline added on top.
- **`original`** — no credible source covers this concern. Author from first principles, document why the gap exists.
- **`vendor-plugin`** — re-publish a third-party plugin with explicit attribution and our matrix integration. Justify why re-publishing beats referencing.

## What we keep (verbatim or near-verbatim)

Concrete list. Cite source for each.

- ...
- ...

## What we adapt

Concrete list. Each item has a *what changed* and a *why*.

- **<topic>**: changed from `<source-version>` to `<void-harness-version>`. Why: ...
- ...

## What we reject

Concrete list. Each item has a *what* and a *why*.

- **<topic from source>**: rejected. Why: ...
- ...

## Hard rules surfaced by this skill

The non-negotiable rules this skill imposes on consumer projects. Each rule is enforceable (either by the skill content or by a companion hook).

- **<rule>**: <statement>. Enforced by: <mechanism — SKILL.md guidance + hook + matrix entry>.
- ...

## Modes (if applicable)

If the skill exposes modes (strict / souple / exploratory or similar), define each mode's contract: when it applies, what it enforces, what it relaxes, how it is selected (auto-detection + override).

## Companion hooks

Hooks that materialize this skill's discipline mechanically (in `packages/core/claude/hooks/`):

- `<hook-name>` — <trigger> — <effect> — see `packages/core/claude/hooks/<hook>.sh`

## Composition with other skills

How this skill interacts with the others it depends on / composes with. Mention any sequencing constraints, conflict-resolution rules, and shared state (configuration files, marker comments).

## Anti-rules (what this skill MUST NOT do)

Mirror of "cannot decide" from the matrix, made explicit:

- MUST NOT ...
- MUST NOT ...

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target LOC, ≤ 400 hard cap
- [ ] Frontmatter `description` targets ≤ 250 chars and never exceeds 500; any extra budget carries triggers, synonyms, or exclusions rather than procedure
- [ ] `.source` file lists every audited source with URL
- [ ] Companion hooks (if any) drafted at ≤ 100 LOC each
- [ ] Matrix row updated in `plans/skill-decision-matrix.md`
- [ ] Skill test in `test/<skill-name>/` produces expected output on at least 2 fixtures
- [ ] No overlap > 30% with another existing skill (manual diff check)
- [ ] Sister-doc parity: AGENTS.md flavor of the skill content matches CLAUDE.md flavor
- [ ] Audit note status moved from `draft` → `reviewed` after user review

## Open questions

Things to resolve before status moves to `reviewed`.

- ...
- ...
