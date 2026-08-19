---
name: devex-audit
kind: action
activation: on-demand
description: "Audit an EXISTING dev-facing surface (API/CLI/SDK/docs): measured TTHW, real error-path tracing, evidence-backed DX scorecard, scoped refine. The audit ceiling to plan-review's DevEx-lens."
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# devex-audit — voidcorp craftsman edition

`plan-review`'s DevEx lens judges a *written plan*'s promises before code exists. This skill dogfoods the *shipped* developer-facing surface and measures what a developer actually hits. It is the audit-time ceiling: a deliberate pass over an existing API / CLI / SDK / docs product to measure its real time-to-value, trace its real error paths, score each dimension against evidence, and drive fixes.

Invoke it to critique, score, or improve a deployed dev surface. It proposes findings and scoped edits; it does not design the contract (`api-and-interface-design` owns that) and it does not re-teach the plan-time DevEx checklist (`plan-review` owns that — this skill assumes it and checks the shipped reality against it).

**Attribution**: see `.source`. Vendored from gstack `/devex-review` (the live DX audit methodology). The gstack runtime (review-log/dashboard, boomerang bin, hall-of-fame file, telemetry, plan-mode plumbing) is rejected. The live browser driver is deferred to Vague 4 (claude-in-chrome MCP).

---

## First principles (every finding traces to one)

1. **Zero friction at T0.** The first five minutes decide adoption. Hello-world without reading docs, without a credit card, without a demo call.
2. **Every error = problem + cause + fix.** An error that only says what, not why or how to recover, is a finding.
3. **Decide for me, let me override.** Opinionated defaults are a feature; escape hatches are a requirement. A default with no override is a finding.
4. **Show code in context.** Hello-world is a lie if it omits real auth, real error handling, real deployment. Solve 100% of the problem, not the toy.
5. **Speed is a feature.** Iteration speed, response time, lines-to-accomplish, concepts-to-learn — measure them.
6. **A magical moment.** The one thing that should feel like magic (Stripe's instant response, Vercel's push-to-deploy) should be the *first* thing a developer experiences.

## Scope honesty: what you can test now vs Vague 4

- **Testable now, via bash + files** — CLI `--help` ergonomics, README/getting-started step count, install command, error output on bad input/missing args, `CHANGELOG`/migration/deprecation quality, TS types + LSP inference, CI config, docs-as-code findability, package manifest.
- **Deferred to Vague 4 (live browser)** — hosted docs search, API playground, signup / first-key flow, 404 and error pages, dashboard. Mark each **"requires live audit — out of scope (Vague 4)"**. Never guess a score for it.
- **Evidence tag on every score**: `TESTED` (you ran it), `PARTIAL` (ran some, inferred the rest), `INFERRED` (read from files only). A guess is not a score. State the evidence source for each dimension.

## The signature metric: measured TTHW (time to hello-world)

Walk the journey `never-heard-of-it → working example`, counting the real steps and time. Score against the benchmark:

| Tier | Time | Impact |
|------|------|--------|
| Champion | < 2 min | 3-4x higher adoption |
| Competitive | 2-5 min | baseline |
| Needs Work | 5-10 min | significant drop-off |
| Red Flag | > 10 min | 50-70% abandon |

TTHW > 10 min is a **blocking** finding.

## The audit passes (each: evidence + score 0-10 + gap-to-10)

These are the same six dimensions `plan-review`'s DevEx lens names as *plan requirements*; here each is measured on the shipped surface with an evidence tag, not promised on paper. Keep the two lists aligned if that lens reshapes a dimension.

1. **Getting started** — step-by-step table (`step · time · friction low/med/high · evidence`), ending in the measured TTHW. Count what a first-timer actually does.
2. **API/CLI/SDK ergonomics** — guessable naming, sensible defaults, escape hatches, progressive disclosure (simple case is production-ready, complex case uses the same surface), coverage vs. dropping to raw HTTP.
3. **Error messages** — trigger three real error paths (bad input, missing arg, unauthenticated). Each must name the problem, the cause, the fix, and link docs (the Elm/Rust/Stripe three-tier bar).
4. **Documentation** — findable in < 2 min, code examples copy-paste-complete (not fragments), version-matched to the installed release.
5. **Upgrade path** — `CHANGELOG` clarity and user-facing framing, migration guides, codemods, deprecation warnings, semver honored, blast radius of a major bump.
6. **Dev environment** — TS types + LSP autocomplete, non-interactive CI, hot reload, cross-platform, test utilities/fixtures.

## Scoring: the gap method

For each dimension, score 0-10 **and** write what a 10 looks like for *this* surface, then fix toward it. Rubric anchors: `9-10` best-in-class (Stripe/Vercel tier) · `7-8` usable, minor gaps · `5-6` works with friction · `3-4` developers complain · `1-2` abandoned after first try · `0` not addressed.

## Evidence-backed scorecard

```
DX AUDIT — <surface>
Dimension          Score  Method     Evidence
Getting started    _/10   TESTED     <step count / cmd>
API/CLI/SDK        _/10   PARTIAL    <--help output / naming>
Error messages     _/10   PARTIAL    <3 traced paths>
Documentation      _/10   INFERRED   <file refs>  (live search: Vague 4)
Upgrade path       _/10   INFERRED   <CHANGELOG / migration>
Dev environment    _/10   INFERRED   <types / CI>
TTHW (measured)    _ min  TESTED     <journey>
Overall            _/10
```

## Plan-vs-reality (optional)

If a prior `plan-review` DevEx scorecard exists for this surface, compare its per-dimension plan score against the live score; flag any dimension where **live < plan − 2** (the plan over-promised). Re-homed from the gstack boomerang — the comparison concept is kept, its `gstack-*` bin machinery is not.

## Refine modes

Once findings exist, drive a scoped, finding-driven fix (not a rewrite):

- `quickstart` — cut TTHW (fewer steps, working default, try-before-install).
- `errors` — rewrite the traced error paths to problem + cause + fix + docs link.
- `docs` — findability, copy-paste-completeness, version match.
- `upgrade` — changelog framing, migration guide, codemods, deprecation warnings.
- `types` — LSP autocomplete, inference, exported types at the boundary.

## Composition & boundaries

- **Not `plan-review`'s DevEx lens** — that judges a *written plan* before code (does the plan name a TTHW target, the error paths, the upgrade story?); this audits the *shipped* surface with measured evidence. Different artifact, different lifecycle stage. The < 30% overlap is structural: plan-requirements there, measured-reality here.
- **Not `ui-review`** — that audits the *visual / interaction* UI (hierarchy, slop, states); this audits the *developer journey* (naming, errors, docs, upgrade). Different subject.
- **With `api-and-interface-design`** — its build-time floor (designing a minimal, stable contract) is what this skill audits after the fact. Build there, judge here.
- **Live browser audit** — deferred to Vague 4 (claude-in-chrome); until then test via bash/files and mark web-only checks as deferred.
- **Supersedes** gstack `/devex-review` (methodology now harness-native).

## Anti-rules

- MUST NOT score a dimension without an evidence tag (`TESTED`/`PARTIAL`/`INFERRED`) — a guess is not a score.
- MUST NOT re-judge a written plan — that is `plan-review`'s DevEx lens.
- MUST NOT redesign the API/CLI/SDK contract — `api-and-interface-design` owns it; this proposes fixes, it does not re-architect the surface.
- MUST NOT drive a browser or make live web requests — defer to Vague 4; test via bash/files and mark web-only checks out of scope.
- MUST NOT trigger error paths against a production tenant or shared data — use a throwaway/local surface for the error pass.
- MUST NOT vendor the gstack runtime (review-log, dashboard, boomerang bin, telemetry, hall-of-fame file).

## Final rule

```
Existing dev surface → scope (testable now vs deferred) → measured TTHW → 6 audit passes with evidence →
gap-method scorecard → scoped refine.
Otherwise → it is not voidcorp devex-audit.
```

Anyone can ship an API. This skill is what tells you, with evidence, whether a developer can actually fall into the pit of success on it.
