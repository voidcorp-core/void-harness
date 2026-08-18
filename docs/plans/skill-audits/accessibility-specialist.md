---
specialist: accessibility-specialist
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `accessibility-specialist`

## Need and boundary

Interactive changes require an explicit WCAG 2.2 AA owner for semantics, names, keyboard, focus,
contrast, targets, errors, live updates, motion, and assistive evidence. It does not own visual taste,
frontend architecture, product flow, functional QA, or implementation.

## Sources and adaptation

WCAG 2.2, ARIA APG, and `accessibility` were distilled into outcome-based review. Static-only
certification and checklist claims without interaction evidence were rejected.

## Overlap audit

Visual Craft Director may observe accessibility defects but cannot certify them. Frontend Engineer
builds the behavior. The specialist alone owns the accessibility verdict, below 30% overlap.
