---
skill: ui-review
status: shipped
strategy: distill + split (build → frontend-design, audit → this skill)
target_loc: 400
actual_loc: 86
activation: on-demand
phase: D
depends_on: []
composes_with: [frontend-design, accessibility, forge]
source_ticket: DEV-389
epic: DEV-383
audit_date: 2026-07-10
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `ui-review`

## Need

The gstack teardown removes the three design skills (`/design-review`, `/design-consultation`, `/design-shotgun`). Separately, Folpe directed that the external standalone `impeccable` skill be internalised too ("tout mettre dans le harnais — si impeccable est intégrable dans un ou plusieurs skills custom, on le fait"), so the harness does not depend on an outside skill for UI craft. This ticket vendors the durable design methodology into the harness and splits it by lifecycle, mirroring the floor/ceiling pattern used for security and plans.

## Decision: frontend-design (build) + ui-review (audit), forge for recon, qa for browser evidence

- **Split by lifecycle**, not one mega-skill: `frontend-design` is the build-time floor (how to write UI right); `ui-review` (new, `on-demand`) is the audit-time ceiling (how to critique/polish an existing UI). Same shape as `security-guidance`/`security-audit` and `plan`/`plan-review`. Each stays ≤ 400 and one-subject; the < 30% overlap is structural — build rules live only in frontend-design, this skill assumes and checks against them.
- **impeccable internalised, not depended on.** Its prose methodology is vendored (audit/critique/refine); its browser runtime is rejected. Harness-native `qa` owns browser evidence; the comparison board remains deferred.
- **forge owns recon/critique-scoring/design-prompt** (voidcorp plugin, bridged by the `docs/specs/` `source: forge` artifact contract — no code dependency). **PENDING**: the four forge issues (below) are drafted but NOT yet filed — issue creation on the external `voidcorp-core/forge` repo was blocked by the permission classifier in this session. Tracked follow-up: Folpe files them (specs in §"Distribution matrix" + below) or grants the permission. Not shipped.

## Distribution matrix (every source section traced)

| Source | Piece | → Destination | Why |
|---|---|---|---|
| impeccable | design guidance (color/type/layout/motion/interaction specifics, absolute bans, color strategy, cream/sand) | **frontend-design** | build-time craft |
| impeccable | AI-slop two-altitude test, register split, refine-mode menu, critique/audit method | **ui-review** | audit-time methodology |
| impeccable | scripts/, reference/*.md command files, `live`, comparison board, pin/hooks | **qa / defer board** | browser evidence is harness-native; comparison board remains deferred |
| design-review | Krug reading model (scan/satisfice/muddle) | **frontend-design** | build-time reading doctrine |
| design-review | first-impression/squint test, interaction-state coverage, emotional arc | **ui-review** | designer's-eye QA |
| design-review | 80-item audit rubric, A-F Design+Slop scoring, goodwill-reservoir, slop blacklist | **forge** (issues) | critique scoring + SLOP-REGISTRY |
| design-review | live screenshots, atomic-fix loop, cross-page click flows | **qa** | browser driver and functional fix loop |
| design-consultation | DESIGN.md schema | **kept as contract** | already a harness contract (frontend-design + pack-nextjs consume; impeccable document/init or hand produce) |
| design-consultation | consultation runtime, design-vocabulary rosters, HTML preview, taste-profile | **forge** (issues) / reject | design-prompt inputs / gstack state |
| design-shotgun | multi-variant + anti-convergence method | **forge** (issues) | design-prompt (N prompts per target) |
| design-shotgun | comparison board, `$D generate` subagents, feedback loop | **defer Vague 4** | browser board |
| all | gstack runtime (preamble, gbrain, telemetry, voice, AUQ machinery) | **reject** | not methodology |

## frontend-design delta (build-time, DEV-389)

Enriched frontend-design (219 → 266 LOC) with: the current-AI-tell absolute bans (side-stripe, gradient-text, glassmorphism, hero-metric, eyebrow/numbered-markers, cream/sand body, text-overflow); the color-strategy commitment axis (Restrained/Committed/Full/Drenched) + OKLCH + physical-scene rule; typography specifics (65-75ch, contrast-axis pairing, clamp ≤6rem, letter-spacing floor, text-wrap); layout/interaction specifics (cards-are-lazy, flex-1D/grid-2D, auto-fit minmax, semantic z-index, dropdown-clipping); motion specifics (ease-out exponential, reduced-motion alternative, reveal-must-enhance-visible); the `system-ui`-as-primary-font ban; and the Krug reading model. Its composition/anti-rules repoint from the gstack design skills to `ui-review` + `forge` + the DESIGN.md contract.

## Rejected / deferred

- Rejected: all gstack + impeccable runtime (scripts, reference command files, preamble, telemetry, voice, AUQ machinery, taste-profile state, HTML preview generator).
- Re-homed in `qa`: live screenshots and the atomic functional fix loop. Variant comparison remains deferred; `ui-review` never drives the browser itself.
- To forge (issues, DRAFTED, not yet filed — see the PENDING note above): (1) `critique`: fold design-review's scored audit rubric + A-F Design/Slop scoring + goodwill-reservoir into the 12-dim critique; (2) `SLOP-REGISTRY`: merge design-review's 11-pattern AI-slop blacklist; (3) `design-prompt`: import the design-vocabulary rosters + anti-convergence distinctness gate; (4) `recon`: confirm competitive-research coverage vs design-consultation Phase 2.

## Verbatim-copy avoidance

The Krug phrasing, the AI-slop blacklist, and the font/aesthetic rosters (highest copy-risk) were paraphrased or routed to forge, not pasted. Sources cited in `.source`.

## DEV-444 post-build adaptation

- Added a fresh Visual Craft Director verdict over evidence captured by `qa`.
- Six dimensions each require 8/10; an average cannot hide a weak craft dimension.
- Rejected LLM-only approval and stale or incomplete viewport/state evidence.

## Verification

Anti-bloat (107 LOC ≤ 400, desc ≤ 200, name==folder, `.source` + this note), native
specialist compilation, deterministic anti-slop/current-evidence evals, and the pure current-diff UI gate.
