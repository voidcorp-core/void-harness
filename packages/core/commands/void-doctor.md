---
description: Run the void-harness install health check and summarize the result (config, doctrine files, settings, jq/gh availability, version drift).
allowed-tools: Bash(void-harness:*), Bash(npx:*)
---

Run `void-harness doctor` in the project root (fall back to
`npx @voidcorp/harness doctor` only if the `void-harness` CLI is not on PATH). Read its output and give
the user a one-screen summary: what is healthy, what is missing or stale, and the
exact next command to fix each problem. Do not attempt fixes automatically —
report and let the user decide.
