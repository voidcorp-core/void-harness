---
skill: accessibility-check
pack: harness-react
status: shipped
strategy: distill
target_loc: 250
phase: G
depends_on: [accessibility-first]
composes_with: [accessibility-first, frontend-design, tdd]
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `harness-react:accessibility-check`

## Need

`harness:accessibility-first` is the doctrine — principles, mobile-first dual-quality, Radix as primitive of choice. It does NOT walk a developer through "I'm writing a button right now, what's my gate". This skill does that — a 7-point checklist applied per component, with the lazy mistake to avoid for each.

A11y skills fail when they're too abstract ("WCAG AA"). They succeed when they're concrete enough that a tired dev at 5pm can run them mentally without opening docs.

## Wins

- 7 points are memorable, each with a concrete "lazy mistake" callout — the form a checklist works best in.
- Composes with Radix philosophy (which the parent `harness:accessibility-first` already establishes).
- Explicit "if you have to use the mouse, it's broken" keyboard test — the fastest signal in practice.
- Final note on AA vs AAA: clarifies AA is the floor, not the ceiling. Avoids the trap of treating it as the goal.

## Loses to

- Non-UI files (`services/`, `adapters/`, `domain/`). Clear exit condition stated.
- Components in `packages/ui/` for which the primitive already wraps Radix correctly — the audit reduces to "did you use the primitive as intended".
- Comprehensive WCAG audits (the skill is a 5-minute gate; deep audits are a separate workflow).

## Composes with

- `harness:accessibility-first` — doctrine; this skill is the operational gate.
- `harness:frontend-design` — anti AI-slop and density discipline.
- `harness-react:01-react.md` — purity rules of components (which themselves reduce a11y surface).
- `harness:tdd` — interactive components get jsdom tests asserting roles and keyboard behavior via `@testing-library/user-event`.

## Sources audited

| Source | Verdict |
|---|---|
| WCAG 2.2 quick reference | Authoritative for contrast, touch target sizes. |
| WebAIM "Designing for Screen Reader Compatibility" | Source of the "name accessible to AT" framing. |
| Apple HIG / Material Design (touch targets) | 44×44 / 48×48 numbers. |
| `harness:accessibility-first` (parent skill) | Doctrine source — this skill is its execution arm. |

## Rejected ideas

- **`harness-react:axe-precommit` as a separate skill** that wraps axe-core in a hook: rejected for now. Axe-core is high-signal but produces noise on some legitimate patterns (custom dialogs, etc.). Shipping it as a hook would create override fatigue. Prefer the manual gate + Lighthouse audit in CI for now.
- **Auto-injecting `aria-label` on icon-only buttons**: tempting (Claude could do this) but the WRONG label is worse than no label. Better to fail loudly in the gate than silently auto-fill.
- **All 25 WCAG 2.2 criteria**: rejected; checklists with >10 items lose adoption.

## Open questions

- Should there be a pre-commit hook that blocks `outline: 0` / `outline: none` in CSS without a `:focus-visible` pair? Concrete and high-impact. Track in [[harness-evolution]] for next iteration.
- Lighthouse a11y score gate in CI: should it ship as a `harness-react:lighthouse-gate` hook or stay a recommendation? Probably hook, but needs CI runner config that varies per consumer.
