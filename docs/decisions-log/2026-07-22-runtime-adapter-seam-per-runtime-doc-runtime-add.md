---
date: 2026-07-22
title: "Runtime adapter seam: core iterates adapters, doc is per-runtime, runtimes add a posteriori"
---

## 2026-07-22: Runtime adapter seam — core iterates adapters, doc is per-runtime, runtimes add a posteriori

Context: the first multi-runtime `init` (same day, earlier) auto-wired Codex but stayed
**bolt-on** — `init`/`doctor`/`update` branched with `if (claude) … / if (codex) …`. Folpe's
standing directive is that void-harness must be **agnostic by construction**: multi-runtime and
multi-model in permanence, not Claude-first with others bolted on. A hardcoded runtime branch
makes every new runtime (Codex exec, Hermes, a local agent) a core edit, which contradicts that.

Decision: introduce a first-class **runtime adapter seam** (`packages/cli/src/lib/runtime-adapters.ts`).

- A `RuntimeAdapter` declares `{ id, label, detect, prerequisites, wire, doctorChecks }`. `wire`
  materializes the runtime's active layer **and its own doctrine doc**; `doctorChecks` verifies
  that layer + doc. The registry `ADAPTERS = [claude, codex]` is the single place a runtime is
  known. **Core commands never branch on a runtime name** — `init`, `runtime add`, and `doctor`
  iterate the adapters. Adding a runtime = one adapter object + registration, zero command edits.
- This is the **agent-runtime** axis only. The orthogonal **model-provider** axis (Anthropic /
  OpenAI-compatible / Ollama / custom) is a separate seam and is explicitly not conflated (the
  universal LLM proxy stays rejected).

Two sub-decisions, both with a credible alternative:

1. **Doctrine doc is per-runtime, not always-both.** Each adapter's `wire` writes only its own doc
   (`init --runtime claude` → only `CLAUDE.md`; `codex` → only `AGENTS.md`; greenfield default
   `both` → both). `doctor` checks only the docs of *detected* runtimes. Rejected alternative: the
   earlier "always emit both docs, cheap and future-proof" behavior — rejected because it made a
   Codex-only project carry (and be health-checked against) a `CLAUDE.md` it never uses, which is
   the Claude-centric premise this directive removes. The sister-doc lockstep gate stays a
   **harness-repo** rule; a consumer only carries what it wired.

2. **Runtimes add a posteriori without friction:** a new `void-harness runtime add <runtime>`
   (+ `runtime list`) wires exactly one runtime's layer on an already-`init`-ed project, touching
   nothing the other runtime owns (verified byte-for-byte: adding Codex leaves `.claude/settings.json`
   identical). This is the `void runtime add` command from the multi-runtime spec, and directly
   serves the archetype "init with Claude, work for weeks, then add Codex painlessly." Rejected
   alternative: telling the user to re-run `init --runtime both --force` — heavier, rewrites Claude
   state, and reads as a reinstall rather than an additive step.

Also folded in here (same refactor): `doctor`'s Claude-marketplace checks (`gh`, plugin cache,
remote versions, packs coherence) now run only when Claude is detected, so a Codex-only project
sees no marketplace noise; and the Codex-floor decision logic (`codexFloorHealth`,
`refreshCodexFloor`) was extracted into `lib/codex-floor.ts` as tested pure-ish functions, fixing
a `doctor` crash on a non-object `.codex/hooks.json` and a false-negative when a sourced hook
library was missing.

Blind spot held deliberately: **over-abstraction.** Exactly the two adapters that exist are
wired — no speculative generality. Hermes is added only after reading its docs
(source-driven-development), as a later phase; the seam is what makes that a one-file change.
Supersedes the "both docs always emitted" line from the earlier same-day decision.
