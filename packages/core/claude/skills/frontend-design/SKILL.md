---
name: frontend-design
description: Anti-AI-slop UI discipline. Density first, 3-size type hierarchy, motion <250ms purpose-driven, components via @repo/ui (Radix/shadcn), mobile-first dual-quality (both viewports verified). Brand identity lives in DESIGN.md per project; this skill is generic. Use whenever building or modifying UI.
---

# frontend-design — voidcorp craftsman edition

AI-generated UI tends to "vibe coded": blue-to-violet gradients, generic hero copy, low information density, mid hierarchy, motion as decoration. The result reads as generated. This skill encodes the discipline that breaks that pattern.

Brand identity (palette, typography stack, motion language) lives in the consumer project's `DESIGN.md`. This skill imposes the DISCIPLINE that applies across all brand identities.

**Attribution**: see `.source`. Foundation: Vercel `frontend-design` plugin (vendored with void-harness additions) + Refactoring UI + Apple HIG + citypaul UI notes.

---

## Mobile-first dual-quality

Every UI is designed mobile-first AND must reach first-class quality on both viewports simultaneously. (Folpe rule, `docs/PHILOSOPHY.md`.)

- **Layout starts at 360–390px** (iPhone 12 mini → 15 Pro range), progressively enhanced wider.
- **Never the reverse.** No "desktop-first then squeeze for mobile."
- **Both viewports screenshot-reviewed before merge** — `viewport-screenshot-gate` hook (shared with `accessibility-first`).
- **No mobile-only / desktop-only features** without an explicit decision logged in `docs/DECISIONS.md`.
- **Performance budget enforced for both**: LCP < 2.5s on slow 4G mobile AND on desktop fiber (composes with `benchmark` in gstack).

---

## Anti-AI-slop — banned patterns

### Banned copy

- "Build faster, ship smarter"
- "Ship 10× faster"
- "Unlock your potential"
- "Empower your team"
- "Transform your workflow"
- Generic CTA: "Get Started Free Forever"

These signal "vibe coded" and lose user trust before the content is read. The companion hook `anti-ai-slop-grep` warns on these patterns in staged copy. Override per-string with explicit code review approval — the discipline is heuristic, the writer is final.

### Banned visual patterns by default

- Blue → violet / purple → pink gradient backgrounds as default decoration
- Abstract 3D / blobs / orbs as primary hero visual
- Lorem ipsum or placeholder text in shipped UI
- Random ad hoc font sizes outside the 3-size system
- Decorative animations longer than 250ms

These are defaults. Brand can override via `DESIGN.md` if the brand justifies a specific pattern (e.g., a brand that legitimately uses a specific gradient). Override is documented; default is rejection.

---

## Information architecture before visual design

The discipline is structural FIRST:

1. **What is the hierarchy?** What does the user need to read / do first, second, third?
2. **What is the primary action?** Singular. The page exists to lead to this action.
3. **What is supporting context?** Provided but recessed.
4. **What is noise?** Cut.

THEN visual:

5. Typography expresses the hierarchy
6. Color guides attention to the primary action
7. Motion communicates state change, not entertainment

AI-generated UI tends to skip the IA step and jump to visual. The result feels busy and unfocused.

---

## Density first

Information density > whitespace by default. Whitespace earns its place via hierarchy, not as default.

Generic AI output over-uses whitespace ("looks clean!") and under-uses density. Real users want to do work, not admire margins.

### Density heuristics

- Lists with > 3 items: tabular, not card-grid-with-images.
- Forms: compact, with inline labels when label space matches input width.
- Dashboards: tabular metrics with sparklines. Cards only for genuinely independent objects.
- Hero sections: useful from the first scroll. No 100vh splash without immediate value.

---

## Type hierarchy: 3 sizes max + weight + color

The design system tokens (in `pack-nextjs-pwa`) expose exactly 3 type sizes:

| Token | Use |
|---|---|
| `text-display` | Page hero, section header (rare) |
| `text-heading` | Section title |
| `text-body` | Everything else |

Differentiation within `text-body` comes from weight (`font-medium`, `font-bold`) and color (`text-primary`, `text-muted`).

### Banned

- Random custom font sizes (`text-[19px]`, `text-[27px]`, etc.) outside the token system
- Five+ levels of heading hierarchy
- Lowercase `text-xs` for body copy on mobile (under 14px is unreadable for many users)

---

## Color guides attention

The primary action is the most saturated, most contrasted, most singular color on the screen. Everything else recesses.

- ONE primary action color per view. Two competing primaries = no primary.
- Secondary actions: muted, lower contrast.
- Tertiary: ghost / link style.
- Destructive: red — but reserve for actually destructive (delete, unsubscribe). Not for "Cancel."

WCAG AA contrast minimum (composes with `accessibility-first` — 4.5:1 normal text, 3:1 large / UI components).

---

## Motion: purpose-driven, < 250ms, ease-out

```css
/* allowed */
.dropdown-content { animation: slide-down 200ms ease-out; }

/* banned */
.hero-decoration { animation: float 8s ease-in-out infinite; }
```

Motion communicates state change. Not entertainment. Reserve for:

- Opening / closing (modal, dropdown, drawer)
- Affordance feedback (button press)
- State transition (success, error)

Duration: < 250ms. Easing: `ease-out` for entry, `ease-in` for exit. The design system (`pack-nextjs-pwa`) provides default tokens.

`prefers-reduced-motion` respected — composes with `accessibility-first`. The design system handles by default.

### Banned

- Looping decorative animations
- Bouncy easing on functional UI (`ease-in-out-back` etc.) — reserves for playful brands explicitly
- Animations longer than 250ms unless documented (page transitions, intentional reveals)

---

## Components from `@repo/ui`

Composed with `accessibility-first`. No hand-rolled UI primitives:

```tsx
// banned
<div className="px-4 py-2 bg-blue-500 rounded" onClick={...}>Submit</div>

// preferred
import { Button } from '@repo/ui';
<Button variant="primary" onClick={...}>Submit</Button>
```

`@repo/ui` is shadcn-style — Radix base + Tailwind tokens + design system extension. Provided by `pack-nextjs-pwa`.

---

## Composition with other skills

- **With `accessibility-first`**: a11y is a precondition. Shared mobile-first dual-quality invariant. Shared `viewport-screenshot-gate` hook.
- **With `typescript-strict`**: component props strongly typed; discriminated unions for variants; no `any` in UI.
- **With `code-review`**: dimensions `readability` and `correctness` include UI quality flags.
- **With `pack-nextjs-pwa`**: provides `@repo/ui` + design system tokens + Tailwind config + shadcn preset matching this discipline.
- **With `gstack:/design-consultation`**: design system creation (DESIGN.md) is UPSTREAM. This skill consumes.
- **With `gstack:/design-review`**: live audit on URLs is DOWNSTREAM. This skill prevents the issues design-review would otherwise catch.
- **With `gstack:/design-shotgun`**: design variant exploration is UPSTREAM.

---

## Companion hooks

- `viewport-screenshot-gate` (pre-PR on UI changes, shared with `accessibility-first`) — fails PRs lacking both mobile and desktop screenshots.
- `anti-ai-slop-grep` (pre-commit) — warns on banned copy patterns. Initial list of ~10; grows from `harness-evolution` feedback.

See `../../hooks/`.

---

## Anti-rules

- MUST NOT decide brand identity (colors / typography / motion language) — `DESIGN.md` per project owns.
- MUST NOT replace `gstack:/design-consultation` (system creation) or `/design-review` (live audit).
- MUST NOT permit hand-rolled UI primitives.
- MUST NOT skip dual-viewport verification.
- MUST NOT silently allow banned copy / banned visual patterns.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Layout looks generic | Density audit. Information architecture first. Cut what does not earn its place. |
| Hero feels weak | Singular primary action. Recess everything else. Cut decorative gradient if generic. |
| Too many font sizes | Reduce to the 3-token system. Vary by weight and color. |
| Motion feels excessive | Cut decorative animations. Keep only state-change communication. |
| Mobile screenshot fails | Layout was desktop-first. Restart at 360–390px. |
| Cannot reach AA contrast | Design system token failure. Adjust palette tokens, not per-component overrides. |

---

## Final rule

```
Every UI → IA first, density first, 3-size hierarchy, motion <250ms, @repo/ui components, dual-viewport verified, brand-from-DESIGN.md.
Otherwise → it is not voidcorp frontend-design.
```

AI generates infinite UI. The discipline is what makes ours stop looking generated.
