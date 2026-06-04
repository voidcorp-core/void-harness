---
skill: claude-md-authoring
status: draft
strategy: distill
target_loc: 200
phase: B
depends_on: []
composes_with: [context-management, source-driven-development, harness-evolution, capture-rule]
matrix_row: plans/skill-decision-matrix.md#claude-md-authoring
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `claude-md-authoring`

## Need

Without this skill, the CLAUDE.md files the harness produces (and the consumer files it audits) bloat by default: they inline code-style rules an LLM enforces probabilistically and unreliably, paste code snippets that rot the moment the referenced code moves, and pile up "be careful" filler. The load-bearing fact is that Claude Code injects CLAUDE.md wrapped in a system-reminder framed "may or may not be relevant," on top of a system prompt that already carries ~50 instructions — so every added line competes for finite attention and dilutes the few rules that matter. What would go wrong without it: a 400-line CLAUDE.md that the model silently ignores, teaching the agent to distrust the whole file, while the rules that should have been hooks, linter config, or settings live nowhere enforced. This skill makes the harness write CLAUDE.md files that are minimal, universal, runnable, and route every instruction to its strongest enforcer.

## Decision matrix anchor

Quote the relevant cells from `plans/skill-decision-matrix.md#claude-md-authoring` (to be added in the same change set by the matrix owner; this audit governs the wording, and per the no-shared-file constraint this audit does not edit the matrix itself):

- **Wins**: authoring or auditing any project CLAUDE.md / AGENTS.md — what belongs, what does not, where each non-belonging instruction goes (hook / linter / settings / deferred doc), and the runnable + pruning discipline.
- **Loses to**: `harness-evolution` on *whether* a proposed harness-wide instruction lands at all (HITL gate); `capture-rule` on *capturing* a stated project rule into `.void/PROJECT-DOCTRINE.md`; `update-config` (gstack) on the actual `settings.json` edit; the linter/formatter on style enforcement itself.
- **Cannot decide**: what the project's architecture or invariants *are* (that is the project's call); whether to adopt a tool; the content of the deferred docs (this skill says *defer*, not *what the doc says*).
- **Composes with**: `context-management` (context is the constraint), `source-driven-development` (deferred docs ground config), `harness-evolution` (governs harness-generated CLAUDE.md), `capture-rule` (routes a stated rule to its enforcer).

If the per-skill content drifts from the matrix, fix one or the other — never let them diverge silently.

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| HumanLayer — Writing a good CLAUDE.md | https://www.humanlayer.dev/blog/writing-a-good-claude-md | read | kept — primary source: "may or may not be relevant" framing, ~50-instruction baseline, no style rules ("never send an LLM to do a linter's job"), file:line over snippets, progressive disclosure, prune by "would removing this cause an error?" |
| HumanLayer — Advanced Context Engineering | https://www.humanlayer.dev/blog/advanced-context-engineering | read | kept — context is the scarce resource; certainties → hooks (deterministic), narrow conditional guidance, runnable file |
| Anthropic Claude Code best practices | https://www.anthropic.com/engineering/claude-code-best-practices | read | kept (CLAUDE.md is weighed context not a contract; concise; run/build/test commands; settings.json for deterministic config) |
| Field reports / issues on CLAUDE.md being ignored | (community reports / GitHub issues, no single canonical URL) | skimmed | kept as motivation — long files get dropped silently; cure is fewer sharper lines + mechanical enforcement |

## Adaptation strategy

`distill`. The HumanLayer articles supply the principles; this skill extracts the load-bearing ones (attention is finite and shared; route each instruction to its strongest enforcer; defer detail; keep it runnable; prune relentlessly) and rewrites them as harness doctrine governing the CLAUDE.md files the harness PRODUCES in consumer projects. Adds an "Auditing an existing CLAUDE.md" pruning checklist (the harness must audit its own) and the harness-standard `Rationalizations` + `Verification` sections. No verbatim vendoring.

## What we keep (verbatim or near-verbatim)

- **The "may or may not be relevant" framing as the central insight** (HumanLayer): CLAUDE.md is weighed context competing for finite attention, not an obeyed contract.
- **"Never send an LLM to do a linter's job"** (HumanLayer): style/format/naming belongs to deterministic tooling, never to the prompt.
- **Prune by "would removing this cause an error?"** (HumanLayer): the audit heuristic, kept as the spine of the pruning checklist.
- **Certainties → hooks** (HumanLayer Advanced Context Engineering): anything that must happen 100% of the time is a hook, not a probabilistic instruction.
- **settings.json for deterministic config** (Anthropic best practices): permissions, attribution, env.

## What we adapt

- **Audience → harness-produced files**: changed from "write your own CLAUDE.md" advice to doctrine for the CLAUDE.md files the harness generates/injects into consumers. Why: this is the harness repo; the skill's job is to govern the artifact the harness ships, and to be the bar a `harness-evolution` feedback item is judged against.
- **Deferred-docs path → `.void/…` / `agent_docs/…`**: adapted the progressive-disclosure target to the harness's own conventions. Why: consistency with `.void/` doctrine paths (recent rename) and the harness's docs layout.
- **Added an explicit routing table** (what does NOT belong → where it goes): adapted the prose advice into a one-glance "route to strongest enforcer" table. Why: the skill must make the *destination* unambiguous, not just say "don't put it here."
- **Added the auditing/pruning checklist**: adapted from the prune heuristic into an operational checklist. Why: the harness will audit its own and consumers' CLAUDE.md; the skill needs a runnable audit, not just a principle.

## What we reject

- **A maison CLAUDE.md generator/templating engine**: rejected. YAGNI; the value is the discipline, not a code generator. `/init` already drafts; this skill prunes.
- **Inlining a full example CLAUDE.md in the skill**: rejected. It would itself rot and would model the bloat the skill exists to prevent. We show small pattern fragments only (pointer + narrow conditional).
- **A hard CI gate blocking any CLAUDE.md over N lines**: rejected for v1 (line count is a proxy, not the harm; high false-positive risk on legitimately larger root files). Left as an open question.
- **Encoding *which* architecture/invariants a project has**: rejected. Not universal; the project owns its invariants. The skill governs form and routing, not the project's content.

## Hard rules surfaced by this skill

- **No code-style/format/naming rules in CLAUDE.md.** Enforced by: SKILL.md guidance + Verification gate + routing table (→ linter/formatter).
- **No rotting code snippets; reference `file:line`.** Enforced by: SKILL.md + Verification gate.
- **Every-time certainties are hooks, not instructions.** Enforced by: SKILL.md + routing table + composition with the hooks layer.
- **Deterministic config lives in `settings.json`, not CLAUDE.md.** Enforced by: SKILL.md routing table (→ `update-config` / settings).
- **CLAUDE.md is runnable: build/test/dev commands succeed from a clean checkout.** Enforced by: SKILL.md + Verification gate.
- **CLAUDE.md is pruned: every line survives "would removing it cause an error?".** Enforced by: SKILL.md audit checklist + Verification gate.

## Modes (if applicable)

None. Single-mode discipline: it applies whenever a CLAUDE.md / AGENTS.md is authored or audited. The "Auditing an existing CLAUDE.md" section is the audit pass of the same single mode, not a separate mode.

## Companion hooks

None in v1. The discipline is prose- and review-level, exercised at authoring and audit time. A future informational lint (e.g. `claude-md-length` flagging files past a soft ceiling, or a `claude-md-snippet-detector` flagging fenced code blocks that should be `file:line`) is an open question, not a v1 deliverable.

## Composition with other skills

- **With `context-management`**: the parent principle. Context is the agent's core constraint; CLAUDE.md spends from the same budget every task pays. This skill is that principle applied to the always-on prompt. Shared mental model: attention is finite.
- **With `source-driven-development`**: when CLAUDE.md defers tool detail to a doc, that doc grounds config in version-matched official sources rather than inlining remembered config into the prompt. Sequencing: CLAUDE.md points → the doc grounds.
- **With `harness-evolution`**: the harness PRODUCES consumer CLAUDE.md files; this skill is the doctrine those generated files must obey, and the bar against which a "the harness should add X to CLAUDE.md" feedback item is judged before it lands (HITL).
- **With `capture-rule`**: capture-rule routes a *stated project rule* into `.void/PROJECT-DOCTRINE.md`; this skill answers *where a rule lands by kind* — every-time certainty → hook; deterministic → settings; project invariant with no enforcer → a lean CLAUDE.md line; deep detail → a deferred doc.
- **Sequencing**: understand the budget (`context-management`) → author/audit the file (this skill) → route each rule to its enforcer (`capture-rule` / hooks / settings / deferred doc grounded by `source-driven-development`) → judge harness-wide additions (`harness-evolution`).

## Anti-rules (what this skill MUST NOT do)

- MUST NOT put code-style, formatting, or naming rules in CLAUDE.md (linter's job).
- MUST NOT inline code snippets that can rot — reference `file:line`.
- MUST NOT encode an every-time certainty as an instruction — make it a hook.
- MUST NOT inline deterministic config (permissions, attribution, env) — `settings.json`.
- MUST NOT add non-universal or decorative lines — every line earns its attention slot.
- MUST NOT ship an auto-generated CLAUDE.md unpruned — generate, then audit down.
- MUST NOT leave an unrunnable command — verify from a clean checkout.
- MUST NOT decide the project's architecture/invariants or whether to adopt a tool (defers to the project / `brainstorming` / `harness-evolution`).

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at ~180 LOC, ≤ 280 line cap (target 150-220), well under the 400 hard cap
- [ ] Frontmatter `description` ≤ 200 chars, precise for auto-discovery ("Use when writing or auditing a project CLAUDE.md")
- [ ] `name:` == directory == `claude-md-authoring`
- [ ] `.source` lists both HumanLayer articles, Anthropic best-practices, and the ignored-CLAUDE.md field reports, with URLs
- [ ] `Rationalizations` table present (`| Rationalization | Reality |`)
- [ ] `Verification` section present (file not shippable until the boxes pass)
- [ ] `## Auditing an existing CLAUDE.md` pruning checklist present
- [ ] Matrix row added at `plans/skill-decision-matrix.md#claude-md-authoring` matching this audit (by the matrix owner; not edited here per the shared-file constraint)
- [ ] Skill test in `test/claude-md-authoring/` exercises at least 2 fixtures (e.g. a bloated CLAUDE.md to prune, a snippet/style-inlining case to route out)
- [ ] No overlap > 30% with `context-management` (that skill manages the *session* window; this one manages the *always-on prompt* artifact) or `capture-rule` (that captures a rule; this routes by kind and governs form)
- [ ] Sister-doc parity: AGENTS.md flavor matches (Codex reads AGENTS.md; same doctrine, "Skill tool ↔ tools", `/init` framing adjusted to Codex's equivalent)
- [ ] Audit status moved from `draft` → `reviewed` after user review

## Open questions

- **`claude-md-length` / snippet-detector hook**: worth an informational lint flagging a CLAUDE.md past a soft ceiling or containing fenced code that should be `file:line`? Risk: line count is a proxy (root files legitimately run larger than nested ones); false positives on intentional fragments. Lean: defer; revisit after auditing the harness's own files and a few real consumers.
- **Soft ceiling number**: is ~60 lines / ~150 instructions the right target to encode, or should it scale with repo size / nested CLAUDE.md depth? Lean: keep ~60 as the authoring target, treat nested files as separate budgets; refine with data.
- **Codex/AGENTS.md parity**: confirm the AGENTS.md flavor names Codex's equivalent of `/init` and the system-reminder framing without hard-depending on Claude-specific wording.
- **Relationship to `update-config`**: ensure the routing table's "deterministic config → settings.json" cleanly hands off to gstack `/update-config` without re-explaining settings mechanics here.
