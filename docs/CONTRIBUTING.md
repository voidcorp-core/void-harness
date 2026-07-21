# Contributing to void-harness

The working rules for this repo live in `CLAUDE.md` (mirrored as `AGENTS.md` for Codex) and the docs it points to. This file is the short index; those are the source of truth.

## Before you write code

1. Read `CLAUDE.md` — the anti-bloat discipline (seven hard rules), sourcing discipline, and hard rules for any added code. A PR that violates the anti-bloat rules is blocked.
2. Read `docs/PHILOSOPHY.md` — the three pillars (safety / performance / DX) and why they win.
3. Read `docs/ARCHITECTURE.md` — package boundaries and dependency direction.
4. Skim `docs/DECISIONS.md` — the decision log is authoritative; do not re-litigate a settled call without superseding it.

## The gates (run before you push)

- `pnpm test` — the suite is the gate before "done".
- `pnpm lint` and `pnpm typecheck` — zero errors.
- `pnpm anti-bloat:check` — the seven anti-bloat rules (skill ≤400 LOC, hook ≤100 LOC, description ≤200 chars, `.source` + audit note per skill, ...).
- `pnpm graph:check` / `pnpm graph:check-bundle` — regenerate `model.json` and the bundle when you add or remove a skill/hook/command.
- `pnpm sync:docs` — `CLAUDE.md` and `AGENTS.md` must stay in parity (a pre-commit hook enforces this; change one, change the other in the same commit).

## Commits

Conventional Commits, and every message ends with **why**, not just what (see `harness:commit-discipline`). Any new convention added in a commit must be reflected in `docs/*.md` in the same commit; any non-obvious decision is logged as a new dated file in `docs/decisions-log/<YYYY-MM-DD>-<slug>.md` (`docs/DECISIONS.md` is the generated index — `pnpm decisions:build` rebuilds it).

## Filing a gap

A perceived harness gap is filed **directly as a GitHub issue** on `voidcorp-core/void-harness` once it clears the agnostic + harness-worthy bar (see `docs/HARNESS_EVOLUTION.md`). There is no per-repo proposal queue.
