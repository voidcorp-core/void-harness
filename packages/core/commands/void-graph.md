---
description: Run the bundled void-graph on the installed harness — no arg opens the local live studio (localhost, offline); audit/cost/behavior print a terminal report of dead/underused/expensive components.
argument-hint: "[audit|cost|behavior] — default: live studio"
allowed-tools: Bash(node:*)
---

Run the self-contained `void-graph` analyzer that ships inside this plugin. It reads the
**installed harness** model (baked into the bundle, filtered to the packs enabled in
`.claude/settings.json`) and correlates it with this project's local telemetry
(`.void/activations.jsonl`, `.void/usage.log`, and Claude Code transcripts). Everything is
local — no npm, no network.

The bundle lives at `${CLAUDE_PLUGIN_ROOT}/graph/void-graph.mjs` (this path is already the
absolute install path). Run that exact path with `node`.

Pick the mode from the argument:

- **No argument (default) → live studio.** Launch it in the background so the session is not
  blocked:
  `node ${CLAUDE_PLUGIN_ROOT}/graph/void-graph.mjs live`
  Read the `serving on http://localhost:<port>` line it prints and tell the user to open that
  URL in a browser. It serves the 3D graph plus a live activation pulse and runs until stopped.
- **`audit` / `cost` / `behavior` → one-shot terminal report.**
  `node ${CLAUDE_PLUGIN_ROOT}/graph/void-graph.mjs <mode>`
  Summarize what it flags: dead / dead-hook / underused / expensive / low-yield components.
  These are **advisory (HITL)** — candidates to trim or tune the harness, never auto-applied.

Notes:
- If the report says "insufficient data", the activation-meter hook has not accumulated enough
  sessions yet (needs >= 20 events / >= 3 sessions); pass `--min-sessions 1 --min-events 1` to
  preview on a single session.
- `cost` falls back to static token weight when no Claude Code transcripts are found.
- If `node` reports the bundle is missing, the harness install is incomplete — run `/void-doctor`.
