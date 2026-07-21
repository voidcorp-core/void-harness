---
date: 2026-06-26
title: "backlog-autopilot `verifyCmd` must mirror CI, not a test + type-check subset (issue #28)"
---

## 2026-06-26: backlog-autopilot `verifyCmd` must mirror CI, not a test + type-check subset (issue #28)

Context: a real batch run drained 4 tickets into one integration PR on a Next.js 16
/ Turborepo / Bun monorepo with `verifyCmd = test + type-check`. The batch went
green, then CI / Vercel surfaced three integration defects the gate could not see:
a `'use client'` barrel dragging a `server-only` service into the client graph
(caught only by `build`), two tickets creating clashing dynamic route slugs at one
path position (production build tolerated it, `next dev` / the Playwright webServer
crashed on boot), and an e2e job that migrated but never seeded the mono-tenant org
(first authed write FK-violated). "The full suite is the judge" ran a strict subset
of CI, so a green batch produced a red CI.

Decision: `verifyCmd` is doctrine-bound to mirror the project's CI gate. For an app
workspace (Next.js especially) that means including `build` and the e2e/integration
suite when one exists, not just unit `test` + `type-check`. The launcher (Layer 1)
defaults `verifyCmd` to the full gate for apps or prompts the human to set it; the
**same** command gates the per-ticket worker and reconciliation (Layer 2), so a
green batch equals a green CI by construction. A credible alternative — keep the
subset default and only warn — was rejected: the divergence is silent and only
surfaces post-merge, which is exactly when it is most expensive.

Why: build- and run-time integration failures (client/server boundaries, route
trees, migrations/seed) are invisible to `test` + `type-check`; aligning the judge
to CI is the cheapest place to catch them. Guidance change only (skill + workflow
prompt text); no new CLI surface.
