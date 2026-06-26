---
name: harness-evolution
description: File project gaps as void-harness issues (feedback mode). Audit obsolescence — unused skills, deprecated sources (audit mode). HITL strict, never auto-writes doctrine. Use on harness gap or audit.
---

# harness-evolution — voidcorp craftsman edition

The harness improves from real project usage, like citypaul's dotfiles improve from his daily work. We systematize that feedback loop with two modes (inbound feedback, outbound audit), HITL strict — no automatic write into harness doctrine, ever.

**Attribution**: see `.source`. Inspiration: citypaul manual curation + Kieran Klaassen compound-engineering loop + Boris Cherny.

---

## Two modes

| Mode | Trigger | Direction |
|---|---|---|
| **feedback** | While coding in a consumer project, you perceive a harness gap or improvement | Inbound — file a void-harness issue directly from the consumer project |
| **audit** | On demand: `npx @voidcorp/harness audit` | Outbound — read usage logs + upstream deprecations, propose deprecations as PRs |

---

## HITL is absolute

- No automatic write into harness doctrine, ever.
- The skill OPENS issues / PRs; it never merges them.
- Every promotion passes through user review.
- Usage telemetry is LOCAL only (`~/.void/usage.log`) — never sent anywhere.

Why: auto-writing into the harness's doctrine creates silent drift, contradictions, prompt bloat over time. The harness is the foundation; foundations don't shift without deliberate decision.

---

## Mode `feedback` — inbound from consumer projects

### When to file

While coding in any consumer project, if you (the agent or the user) perceive:

- A skill is missing (a discipline that would have prevented a bug)
- A rule is wrong (the matrix says X, real usage says Y)
- A skill description is unclear (auto-discovery picked the wrong skill)
- A hook produces false positives (the bypass list is incomplete)
- A pack is missing a primitive (the stack needs Z)
- Two skills overlap badly (real conflict observed)

### The filing bar (load-bearing)

Feedback goes **straight to a void-harness issue** — there is no per-project `proposed/` queue to pre-filter noise. That pre-filter now lives in your judgment, *before* you open the issue. File ONLY when the item clears BOTH tests:

- **Agnostic** — it would help any consumer of the harness, not just this one project. A project-specific rule belongs in that project's `.void/PROJECT-DOCTRINE.md` via `capture-rule`, never on this tracker.
- **Harness-worthy** — it would change a skill, hook, pack, CLI, or doctrine line. Not a one-off preference; not something an existing skill already covers.

Calibrate against the ADR sweep behind issue #34: a full audit that correctly rejected everything except one narrow rule correction. Match that selectivity. When in doubt, do NOT file — a quiet, closeable tracker beats one buried in project-flavored noise.

### How to file

When a gap clears the bar, draft the issue, show it to the user, and on confirmation open it directly on `voidcorp-core/void-harness`:

```bash
gh issue create --repo voidcorp-core/void-harness \
  --title "<area>: <concise gap>" \
  --label enhancement \
  --body "<body with source-project context>"
```

The body carries the source-project context for traceability: consumer repo, commit SHA, file path, and the motivation (what you were doing, what would have helped, the shape of the fix). Confirm with the user before creating — opening the issue is the visible HITL step, even though an issue is only a proposal, not a doctrine write.

### Triage on the tracker, not in a queue

The GitHub issue tracker **is** the triage zone:

- Taking the issue = promoting it.
- Closing it without action = declining it.
- No separate `promoted/` / `discarded/` / `deferred/` bookkeeping, and no `feedback push` step.

A promoted issue becomes a normal PR — usually an audit note + SKILL.md update + matrix row change — citing the originating consumer project so reviewers see the real-usage motivation. Nothing is merged without human review.

---

## Mode `audit` — outbound obsolescence detection

### Trigger

```bash
npx @voidcorp/harness audit
```

### What the audit reads

- `~/.void/usage.log` — local instrumentation. Each skill invocation logs: skill name, mode, timestamp, project. Never sent anywhere.
- The harness's installed skills + packs at `~/.claude/voidcorp/`
- Upstream sources cited in each skill's `.source` file (best-effort URL fetch to detect deprecation notices)
- `~/.void/conflicts.log` — matrix conflicts surfaced by `code-review` skill at runtime

### What the audit produces

A markdown report saved to `~/.void/audit/YYYY-MM-DD.md` listing:

1. **Skills not invoked in N days** (default N = 30; configurable)
2. **Skills whose upstream source has been deprecated / superseded** (per best-effort fetch)
3. **Skills whose decision-matrix cell has fired conflicts repeatedly** (frequent "deferring to Y" patterns)
4. **Skills exceeding their size cap** (regression check against anti-bloat rules)
5. **Hooks with high warn / block rates** (signals false-positive prevalence)

### What happens with the report

The report PROPOSES — it does not act. For each proposal, the user can:

- Open a PR on void-harness to deprecate / fuse / rewrite (hand-authored — `audit` reports, it does not open PRs)
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

- `.void/usage.log` (project-local) is **LOCAL only**. The `audit` reads it. No telemetry endpoint exists. No network call sends usage data anywhere.
- The log format is one line per Skill invocation: `<timestamp>\t<skill>` (written by the `skill-usage-meter` PreToolUse hook). It records only the skill name and time, never project contents.
- Feedback goes straight to a void-harness issue; no per-project queue is committed to consumer repos.
- A filed issue may reference the consumer project (repo, SHA, path). The user confirms the draft before it is opened and controls what is shared.

---

## Companion hooks / CLI helpers

- `skill-usage-meter` — a PreToolUse hook on the Skill tool (`packages/core/hooks/skill-usage-meter.sh`) that appends `<timestamp>\t<skill>` to `.void/usage.log` on every invocation. Observation only; never blocks.
- `gh issue create` — feedback is filed with the GitHub CLI directly against `voidcorp-core/void-harness`; there is no bespoke CLI subcommand for it (the tracker is the queue).
- `audit` — CLI subcommand `void-harness audit` (in `packages/cli/`): reports skills that are active / stale / never-fired from `.void/usage.log` (MVP). Upstream-deprecation and decision-matrix-conflict detection are a planned extension.

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
Gap perceived → clears the agnostic + harness-worthy bar → filed directly as a void-harness issue (with source-project context).
Audit run → report with proposals → user decides PR by PR.
HITL is absolute. No auto-write into doctrine. Triage by closing the issue, not by a per-project queue.
Otherwise → it is not voidcorp harness-evolution.
```

The harness gets sharper over time, not just used more — but only through deliberate edits, not accretion.
