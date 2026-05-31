---
name: capture-rule
description: Capture a project-specific rule into .void/PROJECT-DOCTRINE.md (HITL strict: propose, wait, write, confirm). Universal rules go to harness-evolution. Use when user states a project rule.
---

# capture-rule — voidcorp craftsman edition

When the user states a persistent rule, preference, constraint, or "never do X again", this skill captures it into `.void/PROJECT-DOCTRINE.md` with strict Human-In-The-Loop (HITL) gating. **Never auto-write into doctrine.**

The PROJECT-DOCTRINE.md is imported into every session via `@.void/PROJECT-DOCTRINE.md` in `CLAUDE.md`, so captured rules take effect on the very next user message.

---

## Project rule vs universal rule — BEFORE Step 1

Not every stated rule belongs in PROJECT-DOCTRINE.md. Before proposing the capture, decide:

| Rule scope | Lives in | Captured by |
|---|---|---|
| **Universal** — applies to ALL my projects, my way of coding | `.void/PHILOSOPHY.md` (managed by void-harness) | **`harness-evolution`** skill, mode `feedback`. The user proposes a PR on void-harness. NOT this skill. |
| **Project-specific** — only applies to THIS project (domain, users, ADRs, in-flight decisions, this-codebase routing) | `.void/PROJECT-DOCTRINE.md` | **This skill** (`capture-rule`). |

### Heuristic — is it project-specific?

Ask: "If I started a new unrelated project tomorrow, would this rule still apply?"

- **No** → it is universal → escalate to `harness-evolution`
- **Yes** → it is project-specific → proceed with this skill

### Examples

| Statement | Scope | Why |
|---|---|---|
| "Anti-rustine, only state of the art" | Universal | This is how Folpe codes everywhere. PHILOSOPHY. |
| "No `console.log` in committed code" | Universal | Same. PHILOSOPHY. |
| "Always read official docs before wrapping an SDK" | Universal | Same. PHILOSOPHY. |
| "Our checkout flow uses Better-Auth, not Clerk" | Project | This codebase only. PROJECT-DOCTRINE. |
| "Le webhook Stripe X est sensible — Zod renforcée" | Project | This codebase only. PROJECT-DOCTRINE. |
| "Users sont des chefs de chantier French" | Project | Domain context. PROJECT-DOCTRINE. |
| "Any change to apps/checkout/ triggers tdd strict" | Project | This codebase routing. PROJECT-DOCTRINE. |

### When in doubt

Surface the doubt to the user:

```
This rule could go in two places:
  1. .void/PHILOSOPHY.md (universal — applies to all your projects)
     → escalates via harness-evolution (PR on void-harness)
  2. .void/PROJECT-DOCTRINE.md (this project only)

Which scope did you mean?
```

Wait for the answer before proceeding. Do not guess.

---

## When to invoke

Auto-invoke when the user expresses a **persistent** behavioral rule. Signals:

- Imperative future: "always X", "never Y", "from now on Z"
- Preference statement: "I prefer X", "we don't do Y here", "the rule is Z"
- Anti-pattern callout: "don't do X anymore", "stop doing Y"
- Memory request: "remember that X", "note that Y", "n'oublie pas que Z"
- Explicit ask: "add this rule", "save this", "capture this preference"

Do NOT invoke for:

- One-off task instructions ("fix this bug", "write this test")
- Questions ("how do I X?", "what's the convention for Y?")
- Information statements without imperative ("the API returns Z")
- Ambiguous future intent ("we might want X someday")

When in doubt: ASK before invoking. Better to skip than to spam the doctrine.

---

## Procedure — HITL strict

### Step 1 — Propose the wording in chat

NEVER write to the file first. Surface the proposed addition for review:

```
Proposed rule capture:

  Target file: .void/PROJECT-DOCTRINE.md
  Section:     <Hard rules | Forbidden patterns | Quality bar | Project context |
                Trade-offs already decided | Project-specific skill routing>

  Wording:     <verbatim rule, in imperative present form>
  Why:         <reason if the user gave one — quote them; otherwise skip>
  Enforced by: <skill or hook that materializes this rule, if applicable;
                otherwise "manual review / code-review skill">

Confirm? (yes / change wording / change section / skip)
```

### Step 2 — Wait for explicit confirmation

Acceptable confirmations: `yes` / `ok` / `go` / `vas-y` / `confirme` / `c'est ça`.

Anything else (a question, silence, ambiguity, "maybe") → STOP. Ask again. Do not infer consent.

### Step 3 — Write

Open `.void/PROJECT-DOCTRINE.md`. Find the correct section header. Append the rule at the end of the section in this format:

```markdown
- **<rule subject>**: <verbatim wording>.
  - **Why**: <reason>.
  - **Enforced by**: <skill / hook / manual review>.
```

If the section does not exist (rare — the template seeds all expected sections), add a level-2 header for it at the bottom of the file.

### Step 4 — Confirm in chat

After the edit:

```
Captured to .void/PROJECT-DOCTRINE.md (section: <name>):

  <wording>

Active from the next message via the @.void/PROJECT-DOCTRINE.md import
in CLAUDE.md. Commit with `git add .void/PROJECT-DOCTRINE.md` when you
are ready.
```

---

## Section routing — where to put the rule

| Section | Use for |
|---|---|
| **Quality bar** | What "done" / "shipped" means. Examples: "no half-built features", "ASCII-only", "anti-rustine — only state of the art". |
| **Hard rules** | Concrete, non-negotiable, enforceable rules. Examples: "use @repo/core/logger not console.log", "Zod validation at every trust boundary". |
| **Forbidden patterns** | Things this codebase has paid for and will never reintroduce. Each entry should reference the incident or ADR. Examples: "no DI containers", "no `process.env.*` in business code". |
| **Project context** | Domain-specific facts the agent should know. Examples: "users are TPE/PME French dirigeants", "production is on Vercel with Neon Postgres". |
| **Trade-offs already decided** | Pointers to ADRs in `docs/DECISIONS.md` the agent should NOT re-litigate. |
| **Project-specific skill routing** | "On THIS project, skill X triggers under Y condition". Examples: "any change to apps/checkout/ triggers tdd in strict mode". |

If the rule fits multiple sections, ask the user which one they prefer rather than guessing.

---

## Conflict handling

Before writing, scan the file for conflicting or duplicate rules.

### Duplicate detected

```
Heads-up: a similar rule already exists in <section>:

  <existing rule verbatim>

Your new rule:

  <proposed verbatim>

Options:
  1. Skip — duplicate
  2. Replace — your new wording supersedes
  3. Keep both — they are distinct nuances

Which?
```

Wait for choice. Never silently merge or duplicate.

### Direct conflict detected

```
Conflict: a contradictory rule already exists in <section>:

  Existing: <existing verbatim>
  New:      <proposed verbatim>

This is structural — please decide explicitly:
  1. Replace — new rule wins, existing is removed
  2. Refine existing — edit both wordings to resolve the conflict
  3. Skip — keep existing, drop new

Which?
```

If the user picks Replace, write a small diff to chat showing the removal + addition before committing the edit.

---

## What NOT to do (anti-rules)

- MUST NOT write to PROJECT-DOCTRINE.md before user confirmation.
- MUST NOT capture a one-off task instruction as a persistent rule.
- MUST NOT silently overwrite existing rules.
- MUST NOT add rules that contradict PHILOSOPHY.md (which is the void-harness universal doctrine — if the user wants to override it, that is an ADR in `docs/DECISIONS.md`, not a PROJECT-DOCTRINE entry).
- MUST NOT capture rules without a reason field if the user gave one — the **Why** is what makes the rule survive turnover.
- MUST NOT write to any other file. Just PROJECT-DOCTRINE.md.
- MUST NOT silently retry on a failed confirmation. Ask again clearly.

---

## Composition with other skills

- **`harness-evolution`** — if the rule applies BEYOND this project (e.g., "every voidcorp project should ban X"), the user can promote it from PROJECT-DOCTRINE.md to a void-harness feedback proposal via `void-harness feedback push`. This skill handles the per-project capture; `harness-evolution` handles the cross-project promotion.
- **`commit-discipline`** — captured rules should be committed with a `chore(doctrine):` or `docs(doctrine):` commit. The skill mentions this in the confirmation message but does not commit automatically.
- **`code-review`** — the reviewer can flag PRs that violate freshly added rules. The Review Evidence block should mention compliance with PROJECT-DOCTRINE.

---

## Verification checklist

Before reporting "captured":

- [ ] User confirmation was explicit (not inferred)
- [ ] Section choice is correct (not a guess for a multi-fit rule)
- [ ] Wording is in imperative present form
- [ ] **Why** is present when the user provided a reason
- [ ] **Enforced by** is filled (skill / hook / manual review)
- [ ] No duplicate or conflict left unhandled
- [ ] The chat confirmation message states the file path and section
- [ ] PROJECT-DOCTRINE.md is the ONLY file edited

---

## Final rule

```
User states a persistent rule → propose verbatim → wait for explicit yes →
write to PROJECT-DOCTRINE.md in the right section → confirm in chat.
Otherwise → it is not void:capture-rule.
```

The doctrine evolves deliberately, one explicit step at a time. That is the whole point of HITL.
