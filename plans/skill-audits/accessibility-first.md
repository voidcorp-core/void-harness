---
skill: accessibility-first
status: draft
strategy: distill
target_loc: 300
phase: D
depends_on: []
composes_with: [frontend-design]
matrix_row: plans/skill-decision-matrix.md#accessibility-first
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `accessibility-first`

## Need

Without `accessibility-first`, a11y becomes "we'll audit before launch" — and the audit reveals 80% of the UI needs rework. The skill makes WCAG AA the default, Radix the primitive of choice, and mobile-first dual-quality the layout discipline (touch ≥ 44×44, keyboard parity, contrast verified).

## Decision matrix anchor

- **Wins**: any interactive UI. Keyboard nav, ARIA via Radix, contrast, semantic HTML, touch targets ≥ 44×44px, focus management
- **Loses to**: nothing on accessibility (it is the floor)
- **Cannot decide**: visual design (defers to design-consultation / design-shotgun in gstack)
- **Composes with**: `frontend-design` (enforces mobile-first dual-quality jointly)
- **Mobile-first dual-quality invariant**: every UI ships with verified keyboard nav AND verified touch interaction. Both pass design-review before merge

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| WCAG 2.2 AA | https://www.w3.org/WAI/WCAG22/quickref/ | foundation | kept (target level) |
| Radix UI primitives | https://www.radix-ui.com | foundation | kept (no hand-rolled a11y) |
| Apple HIG touch targets | https://developer.apple.com/design/human-interface-guidelines | reference | kept (44×44 minimum) |
| Folpe mobile-first dual-quality | PHILOSOPHY.md (this repo) | foundation | kept |
| citypaul a11y notes | citypaul/.dotfiles | reviewed | partially kept |
| Vercel frontend-design skill (already installed) | `frontend-design:frontend-design` | composed | composed |

## Adaptation strategy

`distill`. WCAG + Radix + Apple HIG + Folpe rule. Compose with `frontend-design` (Vercel skill, vendored separately).

## Hard rules (draft)

- Interactive primitives wrap Radix. No hand-rolled `<button onClick>` with custom keyboard handling
- WCAG AA contrast minimum (4.5:1 normal text, 3:1 large text, 3:1 UI components). Verified per palette
- Touch targets ≥ 44×44px on every interactive element regardless of viewport
- Keyboard navigation: Tab order logical, focus visible (no `outline: none` without alternative), Escape closes modals/menus
- Skip-to-content link on every page with > 3 nav items
- Forms: labels associated, errors announced via `aria-live`, no placeholder-as-label
- Images: alt text mandatory (empty `alt=""` for decorative is fine, with justification in code)
- `aria-*` minimal: prefer semantic HTML + Radix. Custom ARIA only with comment explaining why
- Mobile-first dual-quality: layout starts 360–390px, progressively enhanced. Both viewports screenshot-reviewed before merge

## Modes — none

## Companion hooks

- `axe-precommit` (pre-commit on UI changes) — run axe-core static analysis on affected components
- `viewport-screenshot-gate` (pre-PR on UI changes) — fail if PR body lacks both mobile and desktop screenshots

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- axe-core integration cost vs benefit — lean enabled by default in pack-nextjs-pwa
- WCAG AAA target for specific projects (high-stakes / regulated)? Defer to consumer's voidcorp.config.json
