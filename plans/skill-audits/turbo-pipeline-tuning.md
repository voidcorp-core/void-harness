---
skill: turbo-pipeline-tuning
pack: void-monorepo
status: shipped
strategy: distill
target_loc: 250
audit_date: 2026-06-01
---

# Audit: void-monorepo:turbo-pipeline-tuning

**Need.** Turborepo's value is incremental caching; misconfigured `outputs`, `dependsOn`, or `cache: true` quietly break the cache (stale builds shipped) or kill it entirely (full rebuild every CI run). Most teams stumble through this by trial-error.

**Wins.** "Bug → cause → fix" table covers the 5 most common pipeline failures. Explicit guidance on when to LEAVE `inputs` alone (default is right). Remote-cache decision gate (≥3 devs OR ≥10 CI runs/day OR ≥1min build).

**Loses to.** Single-app projects (no `turbo.json`). Tasks that run < 1s (not worth pipeline overhead).

**Composes with.** `void-monorepo:service-package` (new packages declare their tasks). `void-monorepo:dependency-direction` (`^build` needs accurate package.json deps). `void:tdd` (`test` task must have `"outputs": []`).

**Why not in core.** Turborepo-specific tooling and config. Single-app build tools (Vite, Next.js standalone) have different pipelines.

**Sources.** Turborepo docs, Vercel best-practices guide, distilled by repeated stumbles on real monorepos.
