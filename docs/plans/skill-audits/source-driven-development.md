---
skill: source-driven-development
status: draft
strategy: distill
target_loc: 200
phase: B
depends_on: []
composes_with: [writing-plans, commit-discipline, adr-workflow]
matrix_row: plans/skill-decision-matrix.md#source-driven-development
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `source-driven-development`

## Need

Without this skill, an LLM agent configures third-party tools from training memory — a lossy average of several versions that produces config that compiles and runs but is subtly wrong (a renamed option, a removed flag, a default that flipped between majors). The bug surfaces in prod, not at write time. What would go wrong without it: config written from recall against the wrong version, and no trace of *why* a non-obvious option was chosen, so the next reader cannot tell intent from accident. This skill makes the official docs of the **installed version** the source of truth and makes the citation survive in the commit.

## Decision matrix anchor

Quote the relevant cells from `plans/skill-decision-matrix.md#source-driven-development` (to be added in the same change set; this audit governs the wording):

- **Wins**: any config or usage of a third-party tool (framework, lib, CLI, API, build/test tool). Version-matched grounding, source citation.
- **Loses to**: `typescript-strict` on type-expression mechanics; the relevant `pack-*` skill when a stack pack already encodes the framework's documented config (compose, do not duplicate).
- **Cannot decide**: whether to adopt a tool at all (that is `brainstorming` / `adr-workflow`); first-party code design (own the source, not "docs").
- **Composes with**: `writing-plans` (grounds stack decisions), `commit-discipline` (the "why" carries the source), `adr-workflow` (alternatives cite official docs).

If the per-skill content drifts from the matrix, fix one or the other — never let them diverge silently.

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| void-harness CLAUDE.md / AGENTS.md hard rule | (this repo) | read | kept — the skill encodes and operationalizes the one-line rule |
| Anthropic Claude Code best practices | https://www.anthropic.com/engineering/claude-code-best-practices | read | kept (give the model current authoritative context; do not rely on training recall) |
| "Ground decisions in official versioned docs" working practice | (methodology, no single canonical URL) | read | kept (version-match the docs, distrust dated tutorials) |
| gstack `/defuddle` | gstack/skills | composed | wrapped — preferred clean-read path for doc pages over raw WebFetch |

## Adaptation strategy

`distill`. The repo states the rule in one sentence; this skill extracts the load-bearing principles (find the installed version, read that version's docs, docs beat memory, official beats third party, cite the reference) and rewrites them as enforceable discipline, adding the harness-standard `Rationalizations` table and `Verification` gate. No verbatim vendoring.

## What we keep (verbatim or near-verbatim)

- **The hard rule itself** (repo CLAUDE.md): read official docs before writing tool config. The skill is its operational form.
- **Authoritative-context-over-recall** (Anthropic best practices): point the model at real, current docs rather than trusting memory.

## What we adapt

- **"Read the docs" → "read the installed version's docs"**: changed from a generic instruction to a version-pinned one (resolve from the lockfile, not the `^` range). Why: option churn happens across majors; reading latest-docs for an older installed version is the common silent failure.
- **Source citation surface**: adapted to live in the `commit-discipline` "why" body and in adjacent comments for non-obvious config. Why: the citation must survive the session; the git log is the audit trail.
- **Clean-read path**: adapted to prefer gstack `/defuddle` over raw fetch. Why: strips nav/ads to load-bearing prose, saves tokens, reduces the chance of reading a sidebar tutorial as if it were the doc.

## What we reject

- **A maison "docs cache" / vendored-docs mechanism**: rejected. YAGNI; freezes upstream docs and recreates the fork burden the repo explicitly rejected for skills. Read live, version-matched.
- **Treating third-party tutorials as citable authority**: rejected. They rarely state their version and rot silently; only the official versioned doc is a source.
- **A hard CI gate that blocks any unsourced config diff**: rejected for v1 (over-broad, high false-positive rate). Left as an open question.

## Hard rules surfaced by this skill

- **Tool config is grounded in version-matched official docs, not memory.** Enforced by: SKILL.md guidance + Verification gate + matrix entry.
- **The installed version is resolved from the lockfile before reading docs.** Enforced by: SKILL.md + Verification checklist.
- **Non-obvious config carries a traceable source citation** (commit body / PR / adjacent comment). Enforced by: SKILL.md + composition with `commit-discipline`.
- **When sources conflict, the official version-matched doc wins; irresolvable conflict is surfaced, not guessed.** Enforced by: SKILL.md conflict-resolution table.

## Modes (if applicable)

None. The discipline is single-mode: it applies whenever third-party config or usage is written. The "When this does NOT apply" section scopes it out of first-party code and throwaway exploration.

## Companion hooks

None in v1. Citation is prose-level discipline carried by `commit-discipline`. A future `unsourced-config-grep` (post-commit, informational: flag a config-file diff whose commit body has no doc URL) is an open question, not a v1 deliverable.

## Composition with other skills

- **With `writing-plans`**: runs upstream. A plan step that pins a library/tool cites the official doc justifying the choice; the plan's stack decisions are grounded, not remembered.
- **With `commit-discipline`**: the mandatory "why" in the commit body is the carrier for the source citation (URL + section + version). Shared state: the git log as audit trail.
- **With `adr-workflow`** (pack-monorepo): a structural tool choice becomes an ADR whose "Alternatives considered" cites each option's official docs rather than folklore.
- **Sequencing**: ground (this skill) → decide / plan (`writing-plans`, `adr-workflow`) → record the "why" (`commit-discipline`).

## Anti-rules (what this skill MUST NOT do)

- MUST NOT write tool config from training memory alone.
- MUST NOT skip the installed-version check (the `^` range is not the resolved version).
- MUST NOT cite a third-party tutorial as authoritative.
- MUST NOT land non-obvious config without a traceable source citation.
- MUST NOT silently arbitrate when sources genuinely conflict — surface the divergence.
- MUST NOT decide whether to adopt a tool at all (defers to `brainstorming` / `adr-workflow`).

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ~200 LOC, ≤ 400 hard cap
- [ ] Frontmatter `description` ≤ 200 chars, precise for auto-discovery ("Use before writing any tool config")
- [ ] `.source` file lists the repo hard rule, Anthropic best-practices, the ground-in-docs practice, and gstack `/defuddle`
- [ ] `Rationalizations` table present (`| Rationalization | Reality |`)
- [ ] `Verification` gate present (work not done until source check done)
- [ ] Matrix row added at `plans/skill-decision-matrix.md#source-driven-development` matching this audit
- [ ] Skill test in `test/source-driven-development/` exercises at least 2 fixtures (e.g. version-mismatch config, unsourced config diff)
- [ ] No overlap > 30% with `commit-discipline` (this skill grounds the choice; commit-discipline records the why) or `writing-plans` (plans the work)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor (Codex uses WebFetch / its own fetch tool; `/defuddle` terminology adjusted)
- [ ] Audit status moved from `draft` → `reviewed` after user review

## Open questions

- **`unsourced-config-grep` hook**: worth a post-commit informational hook that flags a config-file diff whose commit body lacks a doc URL? Risk: high false-positive rate (not every config line is third-party). Lean: defer; revisit after real usage.
- **Defining "non-obvious config"**: where is the line below which a citation is not required? Lean: any option whose name/default a reviewer could not predict from the field alone. Refine with examples after first 5 real uses.
- **Codex parity for `/defuddle`**: confirm the AGENTS.md flavor names Codex's equivalent clean-read path and does not hard-depend on the gstack skill.

## Revision 2026-06-19 — offline / no-network branch + `source-debt` (issue #17 cluster A, A3)

The autonomous loop runs a sandboxed worker that may have **no egress**. Without a branch for that case, the skill is unsatisfiable offline and the worker either stalls or (worse) silently writes config from memory — the exact failure this skill exists to prevent.

Added an **Offline / no-network** section, NOT an egress widening (decision A3 keeps egress at zero):

- **Inject the doc, do not fetch it.** The version-matched reference becomes an input (a port), validated at the boundary with Zod. Functional core / imperative shell: fetching is the adapter's job; the decision logic takes the doc as data. Composes with `hexagonal-architecture` + `security-guidance`.
- **`source-debt`** — a deliberate, tracked IOU when no version-matched doc is reachable: a `source-debt` label, a mandatory PR-body checkbox a reviewer clears by doing the read, and a commit-body note of what is unverified. The honest alternative to a silent guess.
- **Auto-merge is refused while a `source-debt` checkbox is open.** Enforced mechanically in the loop (`integrate.ts: hasUnresolvedSourceDebt` → withhold `gh pr merge --auto`). The offline bypass is for *authoring*, never for *shipping* unverified config.

**Rejected**: requiring an ADR for each source-debt (fails `adr-workflow`'s own rejected-alternative test — a deferred verification is not an architecture decision). The label + PR checkbox + commit note is the right-weight artifact.

SKILL.md grew from 145 → ~163 LOC (still well under the 400 cap; description unchanged, ≤ 200 chars).
