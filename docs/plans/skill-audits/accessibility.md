---
skill: accessibility
status: reviewed
strategy: distill
target_loc: 300
phase: D
depends_on: []
composes_with: [frontend-design, code-review]
matrix_row: plans/skill-decision-matrix.md#accessibility
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `accessibility`

## Need

Without `accessibility`, a11y becomes "we will audit before launch" — and the audit reveals 80% of the UI needs rework. Keyboard navigation is broken, focus rings stripped, touch targets too small, contrast insufficient, semantic HTML replaced by `<div onClick>`. This skill makes WCAG AA the default, Radix the primitive of choice, and mobile-first dual-quality the layout discipline.

## Decision matrix anchor

- **Wins**: any interactive UI. Keyboard nav, ARIA via Radix, contrast, semantic HTML, touch targets ≥ 44×44px, focus management
- **Loses to**: nothing on accessibility (it is the floor, not the ceiling)
- **Cannot decide**: visual design (defers to `design-consultation` / `design-shotgun` in gstack)
- **Composes with**: `frontend-design` (mobile-first dual-quality is shared invariant)
- **Mobile-first dual-quality invariant**: every UI ships with verified keyboard nav AND verified touch interaction. Both viewports screenshot-reviewed before merge

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| WCAG 2.2 AA | https://www.w3.org/WAI/WCAG22/quickref/ | foundation | kept (target level) |
| Radix UI primitives | https://www.radix-ui.com | foundation | kept (no hand-rolled a11y) |
| Apple HIG touch targets | https://developer.apple.com/design/human-interface-guidelines | reference | kept (≥ 44×44 minimum) |
| WAI-ARIA Authoring Practices | https://www.w3.org/WAI/ARIA/apg/ | reference | reference for custom widgets not covered by Radix |
| axe-core rules | https://www.deque.com/axe/ | reference | kept (static analysis baseline) |
| Folpe mobile-first dual-quality | PHILOSOPHY.md (this repo) | foundation | kept |
| citypaul/.dotfiles a11y notes | citypaul/.dotfiles | reviewed | partially kept |
| Vercel frontend-design skill (already installed) | frontend-design:frontend-design | composed | composed (separate skill, vendored separately) |

## Adaptation strategy

`distill`. WCAG + Radix + Apple HIG + Folpe rule. Compose with `frontend-design` (which we vendor from the Vercel plugin in a sibling SKILL).

## What we keep (verbatim or near-verbatim)

- **Interactive primitives wrap Radix** (citypaul): no hand-rolled `<button onClick>` with custom keyboard handling. Use `@radix-ui/react-*` or `@repo/ui` (shadcn-style re-exports). Why: focus management, keyboard nav, ARIA wiring all come from a library that has been audited.
- **WCAG AA contrast minimum** (W3C): 4.5:1 for normal text, 3:1 for large text, 3:1 for UI components / graphical objects. Verified per palette in the design system.
- **Touch targets ≥ 44×44px** (Apple HIG): every interactive element, regardless of viewport. `pack-nextjs-pwa` provides a `Tappable` helper that enforces minimum dimensions.
- **Keyboard navigation parity** (WCAG): Tab order is logical, focus is visible, Escape closes modals / menus, Enter activates primary actions, arrow keys navigate inside composite widgets.
- **Skip-to-content link** on every page with > 3 nav items.
- **Semantic HTML over ARIA** (WAI-ARIA APG "rule of least power"): `<button>` over `<div role="button">`. `<nav>` over `<div role="navigation">`. ARIA is the escape hatch.
- **Form labels associated** (WCAG): every form input has an associated `<label>` (or `aria-label` when visible label is impossible). Placeholder is NOT a label.
- **Errors announced via `aria-live`**: screen readers receive the update. Composes with `frontend-design` error state design.

## What we adapt

- **Mobile-first dual-quality invariant** (Folpe rule): every UI is designed mobile-first AND must reach first-class quality on both mobile and desktop simultaneously. Not "mobile-first then responsive afterthought." Both viewports verified before merge.
- **Layout starts at 360–390px**: progressive enhancement to wider viewports. Never the reverse.
- **Performance budget enforced for both viewports**: LCP < 2.5s on slow 4G mobile AND on desktop fiber. Composes with `benchmark` (gstack) for measurement.
- **No mobile-only nor desktop-only features**: every interaction has an equivalent on the other surface, OR an explicit documented decision in `docs/DECISIONS.md`.
- **Both viewports screenshot-reviewed before merge**: the `viewport-screenshot-gate` hook (also relied on by `frontend-design`) fails PRs without both screenshots.

## What we reject

- **Hand-rolled accessibility**: rejected. Wrap Radix; do not derive ARIA from first principles. Why: subtle keyboard / focus / ARIA bugs are easy to introduce, hard to detect.
- **`<div onClick>` for interactive elements**: rejected. Use `<button>`. The companion code-review flag catches.
- **`outline: none` without an alternative focus indicator**: rejected. Either keep the outline or provide an equivalent (`focus:ring-*` in Tailwind).
- **Placeholder text as label**: rejected. Placeholder disappears on input; screen readers handle it inconsistently; AA contrast often fails.
- **Inaccessible custom dropdowns / modals / tooltips**: rejected. Radix has all of these.
- **Color as the only indicator** (success / error / warning): rejected. Combine color + icon + text. Colorblind users get parity.
- **Auto-playing media with sound**: rejected.

## Hard rules surfaced by this skill

- **Every interactive primitive wraps Radix or `@repo/ui`**. Enforced by: SKILL.md + `code-review` flags raw `<div onClick>` / `<span onClick>` on interactive surfaces.
- **WCAG AA contrast verified**. Enforced by: design system palette tokens have contrast ratios documented; `axe-precommit` hook catches violations on diff.
- **Touch targets ≥ 44×44px**. Enforced by: SKILL.md + `Tappable` helper + `code-review`.
- **Keyboard nav parity** (Tab + Escape + Enter + arrow keys for composite widgets). Enforced by: SKILL.md + Radix usage + `axe` static analysis.
- **Form labels associated**. Enforced by: SKILL.md + `axe-precommit` hook.
- **Errors announced via `aria-live`**. Enforced by: SKILL.md.
- **Both viewports verified** (mobile 360–390px + desktop) before merge. Enforced by: `viewport-screenshot-gate` hook + SKILL.md.

## Modes — none

The discipline is the floor. There is no `souple` mode — softening accessibility is not a project-level taste call; it is excluding users.

## Companion hooks

- `axe-precommit` (pre-commit on UI changes) — runs axe-core static analysis on affected components. Blocks on violations of WCAG AA. ≤ 80 LOC.
- `viewport-screenshot-gate` (pre-PR on UI changes, shared with `frontend-design`) — fails if PR body lacks both mobile and desktop screenshots. ≤ 60 LOC.

## Composition with other skills

- **With `frontend-design`**: shared mobile-first dual-quality invariant. `frontend-design` decides density / hierarchy / motion; this skill enforces a11y across them.
- **With `code-review`**: dimension `correctness` includes a11y at the UI surface — flags raw onClick, missing labels, missing alt, contrast failures.
- **With `pack-nextjs-pwa`**: provides `@repo/ui` shadcn-style components + `Tappable` helper + axe-core integration + design system palette tokens with documented contrast.
- **With `gstack:/design-review`**: deeper visual a11y audit on live URLs (post-deploy or in PR preview).
- **With `gstack:/design-consultation`**: design system creation incorporates a11y constraints from this skill.

## Anti-rules

- MUST NOT decide visual design (color palette, typography, motion language) — those are `frontend-design` / `design-consultation` jurisdictions.
- MUST NOT silently allow `<div onClick>` on interactive surfaces.
- MUST NOT permit `outline: none` without an alternative.
- MUST NOT skip mobile or desktop verification.
- MUST NOT permit color-only indicators.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 300 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions WCAG AA + Radix + touch ≥ 44 + keyboard parity + mobile-first dual-quality as headline
- [ ] `.source` file lists WCAG 2.2 + Radix + Apple HIG + WAI-ARIA APG + axe + Folpe motto
- [ ] `axe-precommit` and `viewport-screenshot-gate` hooks drafted at ≤ 100 LOC each
- [ ] `pack-nextjs-pwa` publishes Tappable helper + axe integration + palette tokens with contrast docs
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/accessibility/` cover: raw onClick detection, missing label detection, contrast violation detection, missing dual-viewport screenshot
- [ ] No overlap > 30% with `frontend-design` (this skill = floor; frontend-design = aesthetic / structural)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **WCAG AAA opt-in**: for high-stakes or regulated projects. Document in `voidcorp.config.json` `wcag_level: 'AAA'` to switch the contrast threshold.
- **axe-core integration cost vs benefit**: lean enabled by default in pack-nextjs-pwa; opt-out for very small static sites.
- **Mobile-first viewport range**: 360–390px is iPhone 12 mini → iPhone 15 Pro. Older / smaller (iPhone SE 320px) included? Lean: document 360 as the floor with note that 320 is reachable via media query but not the default design target.
- **Reduced-motion default**: `prefers-reduced-motion` respected at the design system level. Animations have a reduced-motion variant. Document in `frontend-design`.
