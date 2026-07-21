---
date: 2026-07-09
title: "validate .void/config.json with Zod, a new CLI dependency (issue #68)"
---

## 2026-07-09: validate .void/config.json with Zod, a new CLI dependency (issue #68)

`doctor` now validates `.void/config.json` against a Zod schema
(`packages/cli/src/lib/config-schema.ts`), not just `JSON.parse`. This adds `zod` as the CLI's
third runtime dependency (previously only `@clack/prompts` + the workspace graph package).

The credible alternative was a hand-rolled validator (zero new dependency, ~50 lines). Rejected:
the acceptance criteria require reporting the **offending JSON path** for each problem
(`paths.business`, `packs.@voidcorp/harness-nextjs`), which is exactly what Zod's
`safeParse().error.issues[].path` yields for free; reimplementing path-precise error reporting is
the kind of wheel-reinvention the sourcing discipline warns against, and the harness doctrine
itself mandates Zod at every input boundary (`security-guidance`). The dependency weight is not a
concern here: the CLI is distributed via the marketplace (git), not an npm install, and it is
bundled with esbuild/tsup so Zod is tree-shaken into the output.

Why: an invalid config (a mistyped `paths.*`, a non-semver pin) parses fine as JSON but breaks a
hook later, silently. Schema validation at `doctor` time turns that into an actionable, located
error. The schema is the single source of truth for the config shape and is deliberately tolerant
(every field optional, unknown keys ignored) so legacy and forward-compatible configs pass.
