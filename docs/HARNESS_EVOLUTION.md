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

`void-harness feedback push` automates this: it reads the accumulated `.void/harness-feedback/proposed/` notes and previews them; run with `--open` (optionally scoped to specific files) to file each as a GitHub issue on `voidcorp-core/void-harness` via `gh` and move it to `pushed/`. Previewing by default keeps the promotion deliberate.

## Outbound (harness → consumers)

Periodically the harness should audit itself:

- Skills not invoked recently in any tracked session → candidate for deprecation
- Upstream tooling deprecations (e.g., a library a skill references getting deprecated)
- Repeated matrix conflicts in `plans/skill-decision-matrix.md` → boundaries need reshaping

`void-harness audit` reports this from `.void/usage.log` (written by the `skill-usage-meter` hook): harness skills that are active, stale (`--stale-days <n>`, default 30), or never fired — the never/stale lists being the deprecation candidates. It reports only; deprecation PRs stay hand-authored (HITL). Upstream-tooling deprecation and matrix-conflict detection are a planned extension of the same command.

## HITL is absolute

- No automatic write into doctrine, ever.
- Every harness change is a deliberate commit with a "why" line.
- `capture-rule` (`harness:capture-rule`) handles the human ↔ AI conversation when a new rule is captured.

## See also

- `harness:harness-evolution` skill — the in-Claude workflow for capturing a friction during a coding session.
- `plans/frictions/` — historical frictions before the consumer-side convention shipped.
