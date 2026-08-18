# Harness evolution — feedback loop

The harness improves from real project usage, never auto-applied. Two directions.

## Inbound (consumer project → harness)

While coding in a consumer project, when you perceive "the harness should have X", file it **directly as a GitHub issue** on `voidcorp-core/void-harness`. There is no per-project `proposed/` queue and no `feedback push` step: the issue tracker is the native triage primitive — visible across all consumers, labelable, linkable, closeable — and a per-repo markdown queue was a strictly worse reimplementation of it.

### The filing bar

Going direct-to-issue moves the pre-filter from "before the note exists" to "triage by close on the tracker". For a single-maintainer repo that is cheap, but it makes the filing bar load-bearing. Open an issue ONLY when the gap clears BOTH tests:

- **Agnostic** — it helps any consumer of the harness, not just this project. A project-specific rule belongs in that project's `.void/PROJECT-DOCTRINE.md` (via `harness:learning-capture`), not on this tracker.
- **Harness-worthy** — it would change a skill, hook, pack, CLI, or doctrine line; not a one-off preference, not already covered by an existing skill.

Calibrate against the ADR sweep behind issue #34: a full audit that rejected everything except one narrow rule correction. When in doubt, do not file.

### How to file

Draft the issue, confirm it with the user, then open it with `gh`:

```bash
gh issue create --repo voidcorp-core/void-harness \
  --title "<area>: <concise gap>" \
  --label enhancement \
  --body "<5-15 lines: what happened, evidence, source context, what would unblock me>"
```

The body carries source-project context (repo, commit SHA, file path) for traceability. Opening the issue is the visible HITL step — an issue is a proposal, not a doctrine write. Taking the issue promotes it; closing it without action declines it. No `promoted/` / `discarded/` / `deferred/` bookkeeping.

## Outbound (harness → consumers)

Periodically the harness should audit itself:

- Skills not invoked recently in any tracked session → candidate for deprecation
- Upstream tooling deprecations (e.g., a library a skill references getting deprecated)
- Repeated matrix conflicts in `docs/plans/skill-decision-matrix.md` → boundaries need reshaping

`void-harness audit` reports this from canonical `.void/runs/*/events.jsonl` journals; legacy activation and usage logs are merged as read-only history. It classifies harness skills as active, stale (`--stale-days <n>`, default 30), or never fired - the latter two are deprecation candidates. It reports only; deprecation PRs stay hand-authored (HITL). Upstream-tooling deprecation and matrix-conflict detection are planned extensions.

### Cross-project rollup and opt-in push (#72)

A single repo's telemetry is too thin to trust a "never fired" verdict (a skill fires a handful of times in one project). Each project self-registers into a global index at `~/.void/projects/` — the `activation-meter` hook, the first time it runs in a project, drops a pointer file holding that project's root (telemetry-driven, so even projects wired before this feature announce themselves; the index stays on this machine and holds only paths).

- `void-harness audit --all-projects` and `void-graph cost|behavior --all-projects` aggregate the `.void/*.jsonl` of every registered project before classifying, so the gates actually clear.
- `void-harness audit --push` files the aggregated deprecation candidates as GitHub issues on `voidcorp-core/void-harness`, labelled `harness-feedback`. It is **dry-run by default** (prints the create/update plan and stops); a real push additionally requires an interactive confirmation, and a re-run **updates the same issue** (deterministic title per `type:component`) instead of duplicating. The issues carry component names and aggregate counts only — never a project path, file content, or session id. A missing or unauthenticated `gh` fails loud. HITL is absolute: no issue is ever filed without the explicit flag and the confirmation.

## HITL is absolute

- No automatic write into doctrine, ever.
- Every harness change is a deliberate commit with a "why" line.
- `harness:learning-capture` handles the human ↔ AI conversation when a new rule is captured (project-rule branch) and when a harness gap is filed (harness-gap branch).

## See also

- `harness:learning-capture` skill — the in-Claude workflow for filing a friction as a void-harness issue during a coding session (and for capturing project rules).
- `docs/plans/frictions/` — historical frictions before the consumer-side convention shipped.
