---
specialist: visual-craft-director
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-444
audit_date: 2026-07-27
auditor: VoidCorp
---

# Specialist audit: `visual-craft-director`

## Need and boundary

The builder should not certify its own UI. This role judges rendered post-build craft in a fresh,
read-only context, using current-diff mobile and desktop captures, applicable states, and behavioral
proof. It supplies visual judgment; `qa` owns browser driving and functional exploration, while
`frontend-design` owns implementation-time craft.

## Sources audited

| Source | Status | Adaptation |
|---|---|---|
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | reviewed | Kept observable keyboard, contrast, and accessibility evidence. |
| [Apple HIG visual design](https://developer.apple.com/design/human-interface-guidelines/visual-design) | reviewed | Kept hierarchy and coherent visual-language review. |
| [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) | reviewed | Kept the principle that visual proof belongs to a concrete rendered revision. |
| [Vercel frontend-design](https://github.com/vercel-labs/agent-skills) | reviewed | Kept distinctive, intentional craft and rejected generic generated-UI reflexes. |

## Adaptations and rejections

- Six named dimensions must each reach 8/10; an average cannot hide a weak dimension.
- Screenshots and behavioral proof bind to the current diff, so a later CSS change invalidates them.
- LLM-only approval, self-generated evidence, brand invention, implementation, browser driving,
  functional QA, architecture, and security were rejected.
- DEV-843 separates selection from capture applicability. UI-subject guidance and frontend
  profiles still select scope assessment. Complete relevant evidence of no rendered change yields
  an explicit N/A explanation with inspected paths in `limitations`, without visual scores.
- Template renderers and mixed changes retain visual proof obligations. Relevant omissions need
  permitted reads demonstrably bound to the reviewed revision/receipt; unresolved scope blocks.
  This corrects the unconditional v2 capture obligation without changing the completion schema,
  routing selectors, historical verdicts, or the actual-UI quality gate.

## Verification

Strict YAML schema, bounded fresh read-only runtime agents, canonical-catalog discovery health, a
post-implementation-only v3 contract, a pure fail-closed UI gate, and deterministic anti-slop and
current-proof behavioral evals.

DEV-843 preserves v2 in regression fixtures. A fresh native v2 guidance-only replay reproduced
the false missing-capture blocker before the change. Mechanical version-isolation and selector
guards are separate from native behavior. Nine fresh native v3 fixture evaluations
matched the independent oracle: two explicit non-UI N/A assessments and seven blocked
UI or uncertain-scope cases. The existing completion parser validated their outputs;
fixture and compiled-instruction hashes were checked. These synthetic evaluations
do not replace a production mission certification or rewrite the original v2 verdict.
