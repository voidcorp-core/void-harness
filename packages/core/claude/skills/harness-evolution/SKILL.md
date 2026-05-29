---
name: harness-evolution
description: Capture "the harness should have X" perceptions from real project work and feed them back to void-harness as PRs (mode feedback). Audit obsolescence — unused skills, deprecated upstream sources, repeated matrix conflicts (mode audit). HITL strict — never auto-write into doctrine. Use when noticing a harness gap or running periodic audit.
---

# harness-evolution — voidcorp craftsman edition

The harness improves from real project usage, like citypaul's dotfiles improve from his daily work. We systematize that feedback loop with two modes (inbound feedback, outbound audit), HITL strict — no automatic write into harness doctrine, ever.

**Attribution**: see `.source`. Inspiration: citypaul manual curation + Kieran Klaassen compound-engineering loop + Boris Cherny.

---

## Two modes

| Mode | Trigger | Direction |
|---|---|---|
| **feedback** | While coding in a consumer project, you perceive a harness gap or improvement | Inbound — capture in consumer project, promote via PR to void-harness |
| **audit** | On demand: `npx @voidcorp/harness audit` | Outbound — read usage logs + upstream deprecations, propose deprecations as PRs |

---

## HITL is absolute

- No automatic write into harness doctrine, ever.
- The skill OPENS issues / PRs; it never merges them.
- Every promotion passes through user review.
- Usage telemetry is LOCAL only (`~/.voidcorp/usage.log`) — never sent anywhere.

Why: auto-writing into the harness's doctrine creates silent drift, contradictions, prompt bloat over time. The harness is the foundation; foundations don't shift without deliberate decision.

---

## Mode `feedback` — inbound from consumer projects

### When to capture

While coding in any consumer project, if you (the agent or the user) perceive:

- A skill is missing (a discipline that would have prevented a bug)
- A rule is wrong (the matrix says X, real usage says Y)
- A skill description is unclear (auto-discovery picked the wrong skill)
- A hook produces false positives (the bypass list is incomplete)
- A pack is missing a primitive (the stack needs Z)
- Two skills overlap badly (real conflict observed)

### How to capture

Write a proposal to `.voidcorp/harness-feedback/proposed/YYYY-MM-DD-N.md` in the **consumer project repo** (NOT in void-harness):

```markdown
---
date: YYYY-MM-DD
trigger: <one sentence — what happened>
observation: <what was felt missing / wrong>
target: <core | pack-nextjs-pwa | pack-monorepo | matrix | hook | ...>
component: <skill name | hook name | docs section>
confidence: <low | medium | high>
---

# Trigger

<paragraph — what were you doing, what would have helped>

# Observation

<paragraph — what is the gap, what is the fix shape>

# Proposed change

<paragraph — concrete change to the harness>

# Rationale

<paragraph — why this is worth a permanent rule>
```

The `.voidcorp/harness-feedback/proposed/` directory is committed to the consumer project (the proposal lives with the project context that triggered it).

### How to promote

Run from the consumer project root:

```bash
npx @voidcorp/harness feedback push
```

The CLI:

1. Lists every proposal in `.voidcorp/harness-feedback/proposed/`
2. For each, walks the user: `promote` / `discard` / `defer`
3. For promoted proposals, opens a GitHub issue or PR on `voidcorp-core/void-harness` via `gh`, with:
   - The proposal content
   - A link to the consumer project context (commit SHA, file path) for traceability
   - The user's commentary
4. Moves the proposal from `proposed/` to `promoted/` (or `discarded/` / `deferred/`) so the queue clears

The PR carries source-project context as motivation. Nothing is merged without human review.

### What lands in void-harness

Promoted feedback becomes a normal PR — usually a new audit note + SKILL.md update + matrix row change. The audit note cites the originating consumer project (anonymized if needed) so reviewers see the real-usage motivation.

---

## Mode `audit` — outbound obsolescence detection

### Trigger

```bash
npx @voidcorp/harness audit
```

### What the audit reads

- `~/.voidcorp/usage.log` — local instrumentation. Each skill invocation logs: skill name, mode, timestamp, project. Never sent anywhere.
- The harness's installed skills + packs at `~/.claude/voidcorp/`
- Upstream sources cited in each skill's `.source` file (best-effort URL fetch to detect deprecation notices)
- `~/.voidcorp/conflicts.log` — matrix conflicts surfaced by `code-review` skill at runtime

### What the audit produces

A markdown report saved to `~/.voidcorp/audit/YYYY-MM-DD.md` listing:

1. **Skills not invoked in N days** (default N = 30; configurable)
2. **Skills whose upstream source has been deprecated / superseded** (per best-effort fetch)
3. **Skills whose decision-matrix cell has fired conflicts repeatedly** (frequent "deferring to Y" patterns)
4. **Skills exceeding their size cap** (regression check against anti-bloat rules)
5. **Hooks with high warn / block rates** (signals false-positive prevalence)

### What happens with the report

The report PROPOSES — it does not act. For each proposal, the user can:

- Open a PR on void-harness to deprecate / fuse / rewrite (CLI helper: `npx @voidcorp/harness audit propose-pr <item>`)
- Discard the proposal (mark in the report)
- Ignore for now

PRs opened from audit are normal void-harness PRs reviewed by the maintainer.

### What is NEVER done automatically

- Skill removal
- SKILL.md edits
- Doctrine updates
- Hook removal
- Pack deprecation

All require explicit human review.

---

## Privacy guarantees

- `~/.voidcorp/usage.log` is **LOCAL only**. The `audit` reads it. No telemetry endpoint exists. No network call sends usage data anywhere.
- The log format is documented (one line per invocation: `<timestamp>\t<skill>\t<mode>\t<project-hash>`). The project name is hashed (sha256 first 8 chars) so the log itself does not leak project names — but the user can disable logging via `.voidcorp/config.json` setting `instrumentation: false`.
- `.voidcorp/harness-feedback/` in consumer projects is committed; it contains intentional contributions, not telemetry.
- Promoted feedback PRs to void-harness may reference the consumer project. The user controls what is shared.

---

## Companion hooks / CLI helpers

- `usage-log-instrumentation` — a shared util at `packages/core/claude/lib/usage-log.ts` (≤ 30 LOC) imported by every skill invocation. Writes a line to `~/.voidcorp/usage.log` if instrumentation is enabled.
- `feedback-push` — CLI subcommand `npx @voidcorp/harness feedback push` (in `packages/cli/`)
- `audit` — CLI subcommand `npx @voidcorp/harness audit` (in `packages/cli/`)

(These are Phase D / Phase E deliverables. The skill ships ahead of the CLI tooling so the discipline is documented even before the helpers exist; in the interim, users can manually create PRs and run audits.)

---

## Composition with other skills

- **Composes with every skill** — any skill can be the subject of feedback or audit.
- **Pairs with `code-review`** — a review that surfaces a missing rule may generate a feedback item.
- **Pairs with `office-hours` (gstack)** — proposed scope expansions to the harness (new packs, new skill families) go through office-hours as an idea-validation step before brainstorming a spec.

---

## Anti-rules

- MUST NOT write directly to harness doctrine.
- MUST NOT promote a feedback item without explicit user confirmation.
- MUST NOT auto-merge any PR opened by the skill.
- MUST NOT send usage data anywhere outside the user's machine.
- MUST NOT silently disable instrumentation; the disable is a user-controlled config flag.

---

## Final rule

```
Gap perceived → captured to .voidcorp/harness-feedback/proposed/ → promoted via CLI to void-harness PR.
Audit run → report with proposals → user decides PR by PR.
HITL is absolute. No auto-write into doctrine.
Otherwise → it is not voidcorp harness-evolution.
```

The harness gets sharper over time, not just used more — but only through deliberate edits, not accretion.
