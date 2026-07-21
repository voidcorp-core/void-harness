---
date: 2026-07-09
title: "doc truth pass — living docs match the decision log; CONTRIBUTING created (issue #74)"
---

## 2026-07-09: doc truth pass — living docs match the decision log; CONTRIBUTING created (issue #74)

The docs had drifted from the decision log: `PHILOSOPHY.md` stated the em-dash/emoji rule as
absolute and claimed a `no-emdash-no-emoji-in-commit-msg` hook that does not exist (the 2026-06-01
entry already made it a soft taste rule, not a CI gate); it still promised the `learnings/proposed/`
queue + `voidcorp:learnings-promote` skill that were never built; the design plan's §0bis.4 and
§0bis.8 described removed mechanisms with no "superseded" marker; and `README.md` referenced a
`docs/CONTRIBUTING.md` that did not exist.

All corrected to match the log: the em-dash rule now reads soft in both `PHILOSOPHY.md` and
`CLAUDE.md`, the compound-engineering section points at `harness:compounding` + `capture-rule` +
direct issues, and the two dead design-plan sections carry a dated "Superseded" banner (the plan is
historical — banners, not rewrites).

CONTRIBUTING: chose to **create a minimal `docs/CONTRIBUTING.md`** (a short index pointing at
CLAUDE.md, PHILOSOPHY, the gates, and the issue-filing flow) rather than delete the reference. The
repo is meant to open to outside eyes; a one-screen contributor entry point that defers to the real
source-of-truth docs is more welcoming than a dangling link, and cheap to keep honest.
