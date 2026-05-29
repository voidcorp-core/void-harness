---
skill: security-guidance
status: draft
strategy: compose-gstack + distill
target_loc: 400
phase: D
depends_on: [hexagonal-architecture, typescript-strict]
composes_with: [observability, async-safety, llm-cost-discipline]
matrix_row: plans/skill-decision-matrix.md#security-guidance
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `security-guidance`

## Need

Without `security-guidance`, security is "I'll think about it later" — except later is after the breach. The skill codifies default-secure patterns at the trust boundary: input validation (Zod), SQL via parameterized queries, secrets via env vars never in code, auth via Better-Auth (not hand-rolled), LLM input/output as untrusted by default (prompt injection).

## Decision matrix anchor

- **Wins**: any trust-boundary code (input validation, auth, secrets, SQL, LLM input/output). Default-secure patterns
- **Loses to**: gstack `/cso` for full audit mode. `security-reviewer` agent for diff-level review
- **Cannot decide**: full threat model (escalates to `cso`)
- **Composes with**: `hexagonal-architecture` (boundary discipline), `typescript-strict` (no untyped trust)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| gstack `/cso` lite-mode | gstack/skills | reviewed | composed (full audits delegated to `/cso`) |
| citypaul security stance | citypaul/.dotfiles | reviewed | partially kept |
| OWASP cheat sheets | https://cheatsheetseries.owasp.org | reference | reference (specific cheat sheets cited in-skill: Input Validation, Auth, Session Mgmt, LLM) |
| OWASP Top 10 LLM | https://owasp.org/www-project-top-10-for-large-language-model-applications/ | reference | kept (prompt injection, data leakage, etc.) |
| semgrep rule packs | https://semgrep.dev | reviewed | referenced as opt-in CI tool |

## Adaptation strategy

`compose-gstack` + `distill`. Daily-mode security defaults distilled into skill content; full audit work delegated to `/cso`.

## Hard rules (draft)

- All external input validated with Zod at the trust boundary. No raw `JSON.parse` of untrusted bytes
- Secrets via env vars, validated by `@repo/core/env` (Zod). No `process.env.*` directly in business code
- SQL via ORM (Drizzle) with parameterized queries. No string concatenation. No raw queries without explicit boundary review
- Auth via Better-Auth (default in void-starter) or Clerk (opt-in). Never hand-rolled
- LLM input is untrusted. LLM output is untrusted. Treat both as user-controlled data crossing trust boundaries
- CSRF / SameSite / HttpOnly / Secure cookies — pack-nextjs-pwa enforces defaults
- Logs MUST NOT contain PII or secrets. `observability` composes here
- `dangerouslySetInnerHTML` and equivalents (eval, Function, raw exec) — banned by default, allowlist required

## Modes — none

## Companion hooks

- `gitleaks-precommit` (pre-commit) — already in void-starter, materialize via hook
- `no-process-env-grep` (pre-commit) — fail if `process.env.` appears outside `env.mjs`
- `no-eval-fn-grep` (pre-commit) — fail if `eval(` or `new Function(` appears in staged

## Composition — TBD
## Anti-rules

- MUST NOT replace gstack `/cso` full-audit mode. We are the everyday discipline, not the audit
- MUST NOT decide threat model boundaries — escalates to `/cso`

## Verification checklist — TBD
## Open questions

- Semgrep integration as default CI pack? Lean opt-in via pack-monorepo.
- LLM-specific security skill (prompt injection patterns) — keep here or split? Lean keep here, with a dedicated section
