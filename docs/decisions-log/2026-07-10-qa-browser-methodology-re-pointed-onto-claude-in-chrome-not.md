---
date: 2026-07-10
title: "QA browser methodology re-pointed onto claude-in-chrome, not a daemon port (DEV-390)"
---

## 2026-07-10: QA browser methodology re-pointed onto claude-in-chrome, not a daemon port (DEV-390)

De-gstackification Vague 4 (REBUILD). gstack's QA methodology (`/qa`, `/qa-only`, the live half of `/design-review`)
is valuable, but it drives the gstack `browse` daemon — ~190 CDP/Chromium files. A full port is weeks; Claude Code
already ships the `claude-in-chrome` MCP. Decision: **re-point the QA prose onto the claude-in-chrome MCP** as a new
`harness:qa` skill, and do not port the daemon.

Load-bearing choices:
- **One skill, one subject.** `harness:qa` = "live browser QA of a running web app." `/qa-only` folds in as a
  `--report-only` mode (report-only is a mode, not a subject). The live visual QA from `/design-review` folds in as
  a "visual pass" that **composes `ui-review`** (which already owns the visual-craft methodology) rather than
  restating it. The regression test in the fix loop composes `tdd`/`testing`. < 30% overlap is structural: this
  drives the browser + functional/fix loop; ui-review judges visuals; devex-audit audits dev surfaces; tdd/testing
  author suites.
- **Reject the runtime AND the test-framework bootstrap.** The gstack runtime (browse binary, gbrain/learnings,
  telemetry, `~/.gstack` artifacts, cookie-profile import) is rejected as operational surface. Separately, gstack
  `/qa`'s Test-Framework-Bootstrap block (detect runtime → install a framework → write TESTING.md) is rejected as
  scope creep — standing up a framework is `tdd`/`testing`, and a QA skill that also bootstraps one is two subjects.
- **Cookie import is moot.** claude-in-chrome drives the user's real, logged-in Chrome, so `~/.gstack/chromium-profile`
  cookie import has no purpose — documented as a rejection per the ticket.
- **Assumed limitation, stated not faked.** claude-in-chrome needs an interactive Chrome; headless cloud/cron QA is
  out of scope (the browse daemon had it, this does not). The skill says so rather than inventing a result. A
  headless driver, if ever needed, is a separate initiative.
- **Companion global-config change (Folpe's call).** `~/.claude/CLAUDE.md` (Folpe's personal, cross-project config)
  carried "Always use /browse … Never use claude-in-chrome", which predates the claude-in-chrome adoption and made
  the skill unusable. Because it is his personal file affecting every project, the exact edit was confirmed with him
  (not applied silently): the blanket ban is **replaced by a scoped rule** — claude-in-chrome is the browser layer
  for `harness:qa`/`ui-review` live audits, `/browse` stays available until the Vague 6 teardown. (Alternatives
  offered: flip the default globally, or delete the rule outright; Folpe chose the scoped replacement.)

Why: the QA methodology is the durable value; the daemon is not. Re-pointing keeps the prose and drops ~190 files
of transport, at the cost of an interactive-browser assumption the harness can live with. The teardown (DEV-395)
removes the daemon; this ticket makes its removal safe by giving QA a new home first.
