---
date: 2026-07-10
title: "vendor gstack /retro as harness:retrospective — signal methodology kept, gamification dropped (DEV-396)"
---

## 2026-07-10: vendor gstack /retro as harness:retrospective — signal methodology kept, gamification dropped (DEV-396)

De-gstackification Vague 1 tail (epic DEV-383), spun out of DEV-386. Ships the decision already logged in the
DEV-386 entry: a light dedicated `harness:retrospective` (72 LOC, `on-demand`), NOT a fold into
`learning-capture` (its mapped target `compounding` no longer exists, and a periodic window review is a distinct
subject from a point capture).

Load-bearing choices:
- **Kept the git-history signal methodology**: window gathering from git log / PRs (`gh`) / `.void/usage.log`,
  producing signals (commit-type mix, hotspots, recurring-fix files, test-to-prod ratio, PR size, regressions)
  that end in concrete improvement decisions.
- **Dropped the gamification** (focus score, ship-of-the-week, streaks, week-over-week leaderboard): quantified-
  self productivity theatre, not craftsman doctrine — it optimizes a number, not the code.
- **No gstack data dependency**: reads git log / PRs / `.void/` only, never `~/.gstack/` (which disappears at
  teardown).
- **Feeds `learning-capture`**: the retro discovers window patterns; learning-capture captures the durable ones
  (HITL). The retro writes nothing into doctrine itself. < 30% overlap (window review vs point capture).

Why: the history is already telling you where the debt and the recurring pain are; the retro is the discipline
of listening on a cadence. Losing that at teardown would drop a real quality signal — but the gamification it
was wrapped in was never the value.
