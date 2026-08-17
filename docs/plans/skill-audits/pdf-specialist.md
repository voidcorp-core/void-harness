---
specialist: pdf-specialist
kind: specialist
status: shipped
strategy: distill
source_ticket: DEV-440
audit_date: 2026-07-28
auditor: VoidCorp
---

# Specialist audit: `pdf-specialist`

## Need and boundary

PDF inputs and deliverables need format-specific review for untrusted-content boundaries, rendering,
pagination, typography, tables, links, metadata, accessibility, and artifact evidence. The role does
not own generic docs, product content, functional QA, or UI review.

## Sources and adaptation

Puppeteer PDF options, W3C PDF accessibility techniques, and `make-pdf` were distilled. Browser-daemon
dependency, generic document editing, and pass-without-artifact were rejected.

## Routing and overlap audit

Only the `pdf` predicate activates the role. It requests an engine only for a PDF input or deliverable;
missing required tooling degrades or blocks. DevEx/Docs and QA remain separate owners.
