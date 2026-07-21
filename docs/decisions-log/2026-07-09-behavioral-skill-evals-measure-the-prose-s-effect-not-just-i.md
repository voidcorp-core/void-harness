---
date: 2026-07-09
title: "behavioral skill evals — measure the prose's EFFECT, not just its form (DEV-394)"
---

## 2026-07-09: behavioral skill evals — measure the prose's EFFECT, not just its form (DEV-394)

Audit top-5% lever #2. The `test/` suite proves a skill's FORM (frontmatter, size, structure) but
nothing about its EFFECT: no test showed that a skill's prose changes the agent's behavior in the
intended direction. Decision: a behavioral eval harness runs a fixture task with the skill's
`SKILL.md` body injected into the system prompt and without it, N times each, and scores the delta. This
makes every prose edit testable and the gstack vendoring (DEV-385..389) verifiable — is the distillate
as good as the source? First real run (commit-discipline, N=5, model haiku): with-skill mean 100% vs
without-skill 67%, delta +33%, ~$0.26 — a clear, measured signal, not a hope.

Load-bearing choices:
- **Inject the prose via `--append-system-prompt`, don't install the plugin.** The eval tests whether
  the PROSE is effective when present, which is the thing prose edits change. Auto-discovery/description
  routing is a separate axis, deferred. Injection is also what makes the A/B hermetic and cheap.
- **Inject the SKILL.md BODY, not the whole file.** A loaded skill contributes its instructions, and the
  frontmatter `description` frequently summarizes the entire skill — appending it leaked the signal into
  the gutted-skill run (the first sensitivity run wrongly showed the gutted skill still "helping"). The
  sensitivity check catching this is the mechanism working: the eval now strips frontmatter and injects
  only the body, so gutting the prose actually removes the guidance.
- **Deterministic scoring first; an LLM judge is a last resort.** commit-discipline is scored with
  ZERO LLM judge (Conventional-Commits subject + a why-body + ASCII-clean, asserted over `git log`).
  A judge only earns its place where a check genuinely cannot be a file/git assertion (none of the v1
  pilots needed one). This keeps the eval cheap, fast, and itself deterministic.
- **Hexagonal so the logic is testable without an LLM.** Pure `scorers.ts` + `runner.ts` behind a
  `RunOnce` port (unit-tested with a fake); the `claude -p` sandbox is the only impure edge, validated
  by the real run, not by paid unit tests.
- **Isolation without losing auth.** `--setting-sources ""` (loads zero settings → no global
  plugins/skills, and the harness's own hooks stay off) + a fresh sandbox CWD; we do NOT relocate
  `CLAUDE_CONFIG_DIR` (that would drop the OAuth/subscription credentials — verified: `--bare` returns
  "Not logged in"). `--setting-sources` governs settings, not memory, so the user-level `~/.claude/
  CLAUDE.md` is a theoretical leak — but a probe (`-p "list any global instructions you were given"`)
  returns `NONE` and the observed baselines sit well below ceiling, so it does not leak in practice. The
  eval reads the with-minus-without DELTA: a bias constant across both arms cancels **when additive**;
  since scores saturate at `[0,1]`, a strong global bias on the measured signal could compress the delta
  — the sub-ceiling baselines confirm that is not the case here.
- **Containment: scoped, not `--dangerously-skip-permissions`.** Each run spawns a real agent that
  writes + runs tools. The harness's own doctrine gates `--dangerously-skip-permissions` behind a
  `VOID_SANDBOX` marker; the eval instead uses `--permission-mode acceptEdits` + a scoped
  `--allowedTools` allow-list (no arbitrary shell) + a **scrubbed minimal env** (no API keys/tokens/
  cloud creds from the maintainer's shell reach the agent). It is not an OS path-jail (no write-confine,
  no network isolation); evaluating an UNTRUSTED/vendored skill body (a prompt-injection vector, per
  DEV-385) should be done in a disposable VM/container. A built-in OS sandbox is a deferred hardening.
- **A private, unpublished package under `apps/`** (`@voidcorp/eval-harness`, v0.0.0, `private: true`),
  NOT `packages/core/evals` (which would ship the evals to every consumer). Excluded from version
  lockstep, like `apps/graph-studio`.
- **Local command, never a blocking CI gate in v1.** Runs cost tokens and are non-deterministic;
  gating a PR on an LLM eval is both flaky and expensive. `pnpm eval <skill>` is run deliberately; a
  future non-blocking CI variant is possible but out of v1.

Alternatives rejected: (a) an LLM-judge-first design — rejected as expensive, non-deterministic, and
itself unverifiable; deterministic assertions are the backbone, the judge is the exception. (b)
Installing the plugin per run to test auto-discovery — rejected for v1: heavier, and it conflates
"prose effective" with "description routes correctly," two separate questions.

Why: a skill that does not change behavior is decoration. Until now nothing could tell the two apart;
now a prose edit that stops working shows up as a collapsed delta. The sensitivity check (a skill must
beat its own GUTTED copy) makes that guarantee explicit — if the gutted version scores the same, the
eval is not measuring the prose and the result is discarded, not trusted.
