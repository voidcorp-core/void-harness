---
skill: frontend-design
status: draft
strategy: vendor-plugin
target_loc: 350
phase: D
depends_on: [accessibility-first]
composes_with: [typescript-strict]
matrix_row: plans/skill-decision-matrix.md#frontend-design
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `frontend-design`

## Need

Without `frontend-design`, AI-generated UI tends to "vibe coded" output: blue-to-violet gradient cliches, generic hero "Build faster, ship smarter", insufficient information density, mid hierarchy, motion as decoration. The skill enforces distinctive, production-grade UI — the opposite of generic AI slop.

## Decision matrix anchor

- **Wins**: any new UI component or layout. Anti-AI-slop rules, density, hierarchy, motion discipline, mobile-first layout design
- **Loses to**: gstack `/design-consultation` for design system creation. gstack `/design-review` for live audits
- **Cannot decide**: brand identity (DESIGN.md owns it)
- **Composes with**: `accessibility-first`, `typescript-strict`
- **Mobile-first dual-quality invariant**: layout starts 360–390px, progressively enhanced. No desktop-only layout shipped without an equivalent mobile experience. Both viewports screenshot-reviewed before merge

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Vercel `frontend-design` plugin (`frontend-design:frontend-design` installed globally) | https://github.com/vercel-labs/agent-skills | foundation | **vendored as void-harness skill** with our matrix integration + mobile-first dual-quality invariant + integration with our `accessibility-first` |
| citypaul UI patterns | citypaul/.dotfiles | reviewed | partially kept |
| Folpe DESIGN.md per-project | DECLIK/DESIGN.md, solaar designs | reference | brand identity stays in consumer DESIGN.md, this skill is generic |

## Adaptation strategy

`vendor-plugin`. Re-publish Vercel `frontend-design` plugin as `voidcorp:frontend-design` (with attribution in `.source`) and integrate:

1. Mobile-first dual-quality invariant (the load-bearing void-harness addition)
2. Matrix integration (boundary with `accessibility-first`, gstack `/design-consultation`)
3. Composition with `pack-nextjs-pwa` shadcn defaults

## Hard rules (draft)

- Anti-AI-slop: no generic gradients-bleu-violet, no "build faster ship smarter" copy, no hero with abstract 3D shapes by default
- Density-first: information density > whitespace by default. Whitespace earns its place
- Type hierarchy: 3 sizes max + weight + color (no random ad hoc font sizes)
- Motion: purpose-driven, < 250ms, ease-out. No bouncy decorations. Respect `prefers-reduced-motion`
- Mobile-first dual-quality: layout starts at 360–390px, progressively enhanced. Touch ≥ 44×44. Keyboard parity
- Brand identity from DESIGN.md (consumer-specific). This skill does NOT impose colors / typography / motion language — it imposes the discipline
- Components from `@repo/ui` (or shadcn re-export). No hand-rolled buttons / modals / forms

## Modes — none

## Companion hooks

- `viewport-screenshot-gate` (pre-PR on UI changes, shared with `accessibility-first`) — fail if PR body lacks both mobile and desktop screenshots
- `anti-ai-slop-grep` (pre-commit) — warn on banned strings (build faster ship smarter, etc.) — false positives expected, hence warn-only

## Composition

- Composes with `accessibility-first` (a11y is a precondition, not a layer on top)
- Defers UPSTREAM to gstack `/design-consultation` for design system creation
- Defers DOWNSTREAM to gstack `/design-review` for live audits

## Anti-rules

- MUST NOT decide brand identity (colors, typography, motion language) — DESIGN.md owns
- MUST NOT replace gstack `/design-consultation` (system creation) or `/design-review` (live audit) — different phases

## Verification checklist — TBD

## Open questions

- Vendor verbatim from Vercel plugin or fork? Lean fork (the mobile-first dual-quality invariant is a non-trivial addition)
- Anti-AI-slop banned-strings list — start with 5-10 obvious ones, grow from feedback queue
