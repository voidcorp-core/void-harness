---
description: Run the void-harness install health check and summarize the result (config, doctrine files, settings, jq/gh availability, version drift).
allowed-tools: Bash(void-harness:*)
---

Run `void-harness doctor` in the project root. The CLI is public on npm as
`voidharness` (command: `void-harness`); if it is not on PATH, run
`npx voidharness doctor`.

Read its output and give the user a one-screen summary: what is healthy, what is
missing or stale, and the exact next command to fix each problem. Do not attempt
fixes automatically — report and let the user decide.
