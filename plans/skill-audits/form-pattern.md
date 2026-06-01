---
skill: form-pattern
pack: void-react
status: shipped
strategy: distill
target_loc: 200
audit_date: 2026-06-01
---

# Audit: void-react:form-pattern

**Need.** Forms are a recurring "where does the validation live, who handles errors, how does submit interact with Server Actions" question. Default stack (react-hook-form + Zod resolver + shared schema with Server Action) eliminates the question.

**Wins.** Canonical skeleton with the 5 things-to-notice annotated. Schema sharing pattern (one Zod import, both sides) prevents drift. "When NOT to use" section catches the single-field case.

**Loses to.** Single-field forms (use native HTML + Server Action). File-only uploads. Multi-step wizards (consider state machine).

**Composes with.** `void-server:server-action` (submit target; shared schema). `void:security-guidance` (Zod = trust boundary). `void-react:state-architecture` (form state is local). `void-react:accessibility-check` (labels, role=alert, focus).

**Why not in core.** react-hook-form is React-specific. Server-side form handling (Server Actions) is server-pack concern; client UX orchestration is react-pack concern.

**Sources.** react-hook-form docs, @hookform/resolvers Zod adapter, distilled by repeated form bugs on real projects.
