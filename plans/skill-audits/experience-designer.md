---
specialist: experience-designer
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-444
audit_date: 2026-07-27
auditor: VoidCorp
---

# Specialist audit: `experience-designer`

## Need and boundary

UI work needs an independent experience decision before implementation, while changes are still
cheap. This role turns supplied product intent into a bounded build brief covering information
architecture, flow, states, responsive intent, keyboard use, and accessibility. It does not create
brand identity, review post-build polish, implement, drive a browser, or own product strategy.

## Sources audited

| Source | Status | Adaptation |
|---|---|---|
| [Nielsen Norman usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | reviewed | Kept system visibility, user control, error prevention, and recovery as state and flow requirements. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | reviewed | Kept keyboard and accessible interaction constraints without duplicating the accessibility skill. |
| [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios) | reviewed | Kept responsive and touch-context intent, translated to runtime-agnostic constraints. |

## Adaptations and rejections

- A pass means the supplied evidence supports a concrete build-ready brief, not that a workshop ran.
- Findings and evidence requests carry gaps without adding a second output schema.
- Unsupported user research claims, generic personas, brand creation, post-build review, code edits,
  browser control, functional QA, architecture, and security were rejected.

## Verification

Strict YAML schema, bounded inputs and turns, fresh read-only compilation for both runtimes, native
discovery, and a UI gate that blocks missing or stale pre-build attestation.
