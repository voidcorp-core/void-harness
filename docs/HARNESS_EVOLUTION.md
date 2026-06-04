# Harness evolution — feedback loop

The harness improves from real project usage, never auto-applied. Two directions.

## Inbound (consumer project → harness)

While coding in a consumer project, perceptions of "the harness should have X" are captured as **friction notes** in the consumer's `.void/harness-feedback/proposed/` directory.

### Convention

```
<consumer-project>/.void/harness-feedback/proposed/
├── 2026-06-01-default-pin-is-stale.md
├── 2026-06-01-init-assumes-bun.md
└── ...
```

Each note is a markdown file with this frontmatter:

```yaml
---
date: 2026-06-01
source: solaar                          # which consumer surfaced it
kind: bug | friction | feature-request | doctrine-drift
severity: critical | major | minor
status: proposed | accepted | rejected | shipped
---
```

Body: 5-15 lines describing the friction, with concrete evidence (transcript snippet, error output, command that produced it). End with **What would unblock me**.

### Promotion

Currently manual: review accumulated `.void/harness-feedback/proposed/` files when you next touch the harness, file each as an issue or PR on `voidcorp-core/void-harness`. A `void-harness feedback push` CLI command is on the backlog to automate this (creates GitHub issue via `gh api`).

## Outbound (harness → consumers)

Periodically the harness should audit itself:

- Skills not invoked recently in any tracked session → candidate for deprecation
- Upstream tooling deprecations (e.g., a library a skill references getting deprecated)
- Repeated matrix conflicts in `plans/skill-decision-matrix.md` → boundaries need reshaping

A `void-harness audit` CLI command is on the backlog. For now this is manual via `gh api` over consumer telemetry (TBD).

## HITL is absolute

- No automatic write into doctrine, ever.
- Every harness change is a deliberate commit with a "why" line.
- `capture-rule` (`void:capture-rule`) handles the human ↔ AI conversation when a new rule is captured.

## See also

- `void:harness-evolution` skill — the in-Claude workflow for capturing a friction during a coding session.
- `plans/frictions/` — historical frictions before the consumer-side convention shipped.
