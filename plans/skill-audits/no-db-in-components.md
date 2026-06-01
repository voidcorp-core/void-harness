---
skill: no-db-in-components
pack: void-react
status: shipped
strategy: native-hook
target_loc: 50
phase: F
hook_type: PreToolUse (Edit|Write)
composes_with: [hexagonal-architecture, frontend-design]
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.7
---

# Hook audit: `void-react:no-db-in-components`

## Need

The `01-react.md` module declares "components are pure UI, no DB, no fetch" as a hard rule. Without a hook, the rule is documentation only — Claude or a human can violate it during edits and the convention quietly degrades. Components-with-queries is the most common architectural drift in React+Drizzle codebases, and it kills testability + cache predictability.

This hook materializes the rule at the Edit/Write phase. Cheap, deterministic, reversible (just tag the line with `// allow-db: <reason>` for the rare legitimate case).

## Scope

Blocks imports matching `(@repo/db|@/db|@/lib/db|drizzle-orm)` inside files under `apps/*/src/components/`. Tests, stories, mdx are skipped. Surgical exception via per-line `// allow-db: <reason>` tag.

## Wins

- Catches the violation at edit time, not at code review.
- Zero config (no per-project setup beyond enabling `void-react`).
- ASCII-only output, exit codes (0/1) — works in any hook runner.

## Loses to

- Files outside `apps/*/src/components/`. Components in `packages/ui/src/` are a different story (UI lib internals can legitimately query a local fixture in dev); scope is intentionally narrow.
- Indirect DB access via a service that itself queries the DB. This hook only catches *direct* imports — composing services that hit DB is fine (and is the right pattern).

## Composes with

- `void:hexagonal-architecture` — components → services → adapters → infrastructure. Components stay at the top, far from DB.
- `void-react:01-react.md` — module declares the rule; this hook enforces it.
- `void:frontend-design` — purity of components is a design discipline as much as architectural.

## Rejected variants

- **Hook in `void-monorepo`**: tempting because the path `apps/*/src/components/` is monorepo-shaped. Rejected because the *concern* is React (component purity), not monorepo (workspace layout). A single-app Vite project would still want this enforcement.
- **Block ALL imports starting with `@/`**: too broad. We only care about DB-shaped imports.
- **Block `await db.…` patterns instead of imports**: harder to grep reliably (multi-line), and an unused import is still a signal of intent.

## Open questions

- Should the hook also block direct `fetch('http…')` calls in components (which violate the same convention)? Possibly — capture as a follow-up. Risk: legitimate `fetch` to a same-origin Next.js route handler from a Client Component is rare but valid. Need a heuristic.
