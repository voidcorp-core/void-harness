---
description: Run the void-harness install health check and summarize the result (config, doctrine files, settings, jq/gh availability, version drift).
allowed-tools: Bash(void-harness:*)
---

Run `void-harness doctor` in the project root. The CLI is maintainer tooling and
is distributed only via the harness repo (marketplace-only: the `@voidcorp/harness`
npm package is not published — see docs/DECISIONS.md). If `void-harness` is not on
PATH, do NOT try `npx @voidcorp/harness` (it 404s); tell the user the maintainer
CLI is not installed and point them at the repo's README to run it locally.

Read its output and give the user a one-screen summary: what is healthy, what is
missing or stale, and the exact next command to fix each problem. Do not attempt
fixes automatically — report and let the user decide.
