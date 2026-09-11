---
schemaVersion: 1
ticket: DEV-811
status: certified
runtime: codex
---

# Codex subscription certification

The authorized runtime probe completed on 2026-09-11 with the official Codex
CLI in a ChatGPT authenticated session. The probe inspected one versioned
native contract and returned the expected certification marker.

| Field | Observed value |
| --- | --- |
| CLI | `codex-cli 0.145.0` |
| package | `@voidcorp/eval-harness@0.0.0` |
| source SHA | `4a32b85c4dce92d6230f82e7de581009469a0126` |
| execution | `codex exec --ephemeral --sandbox read-only` |
| MCP | disabled |
| web search | disabled |
| API environment | removed before launch |
| result | `SUBSCRIPTION_READONLY_CERTIFIED` |
| run | `01a08f94-6c8e-73d0-94c2-58196096acfe` |
| evidence digest | `sha256:9b25bacf4d441bedf1f2fc0d54eb5c439c1d4391f3bf68d837ed7ddba9cf7787` |

The raw prompt, response and environment were not persisted. The CLI emitted a
local model-cache warning before the run, but the run completed successfully;
the warning is retained as an environment observation and does not affect the
certification result.
