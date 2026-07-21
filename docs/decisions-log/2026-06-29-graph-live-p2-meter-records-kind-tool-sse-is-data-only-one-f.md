---
date: 2026-06-29
title: "graph live (P2) -- meter records `kind=tool`, SSE is data-only, one `frameAt` for live+replay"
---

## 2026-06-29: graph live (P2) -- meter records `kind=tool`, SSE is data-only, one `frameAt` for live+replay

Context: P2 "live" (the `is` layer) needed three coupled decisions, each with a
credible alternative. Spec: `docs/specs/2026-06-29-graph-live-p2.md`.

Decision 1 -- the activation meter records `kind: skill|agent|workflow|tool`, NOT the
`skill|agent|hook|workflow` the parent spec (§8) listed. A universal `PreToolUse *`
hook observes tools, never hooks; logging "which hook fired" would force every hook
to self-log (fragile meta-logging, N files). Instead it records situations
(`kind=tool` + `trigger.fileGlobs/ext`); "should this hook have fired" is derived in
M8 by matching situations against declared triggers. The single `activation-meter.sh`
absorbs the old `skill-usage-meter.sh` and keeps writing `usage.log` for skills
(audit + studio halos unchanged).

Decision 2 -- `graph live` serves data only (`/model.json`, `/history`, `/events`
SSE); it does NOT bundle the studio `dist`. The studio stays a separate app and
connects via `VITE_LIVE_URL`. The HTTP contract is a strict superset of the future
all-in-one server, which only adds `GET / -> dist` later -- a non-breaking addition.
Alternative rejected: bundle the studio dist into the CLI now. That forces a
cross-package build + asset-mirror gate for zero behavioural gain at this stage;
deferred to a dedicated packaging increment once the behaviour is locked.

Decision 3 -- live and replay share one pure function `frameAt(events, cursor,
window)`. Live pins the cursor to now (fed by the SSE stream); replay detaches it to
the scrubber position over `/history`. One calculation, two pilots -- no duplicated
intensity logic. Alternative rejected: a separate live pulser + replay renderer; it
duplicates the decay math and drifts.

Also: `null` was avoided throughout (harness:functional) -- parse/lookup return
`undefined`.
