---
skill: no-process-env-in-app
pack: void-server
status: shipped
strategy: native-hook
target_loc: 50
hook_type: PreToolUse (Edit|Write)
audit_date: 2026-06-01
---

# Hook audit: void-server:no-process-env-in-app

**Need.** env-validation skill says "use @repo/core/env, not process.env". Without a hook, the rule decays. Direct process.env usage spreads silently; the validation guarantee evaporates.

**Wins.** Cheap grep. Surgical override (`// allow-process-env: <reason>`). Skip the env module itself + tests + generated files.

**Loses to.** Code outside `apps/*/src/` (packages/, scripts/). Files explicitly tagged. Generated code.

**Composes with.** `void-server:env-validation` (the skill enforces what this hook checks). `void:security-guidance` (env-as-trust-boundary doctrine).

**Why not in core.** Server-side concern; client-side has its own conventions (NEXT_PUBLIC_*) handled differently.
