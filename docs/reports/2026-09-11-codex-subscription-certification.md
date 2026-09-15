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
| source SHA | `c9fef7a87d1eda4fcfef46c8c29cb12021f71050` |
| execution | `codex exec --ephemeral --sandbox read-only` |
| MCP | disabled |
| web search | disabled |
| API environment | removed before launch |
| result | `SUBSCRIPTION_READONLY_CERTIFIED` |
| run | `01a08f98-ef91-7440-af60-602f0a94b945` |
| evidence digest | `sha256:d2e54a5a22d297a7affc9f633aa0869035e9194f76a431e6dc927681cfc85def` |

The raw prompt, response and environment were not persisted. The CLI emitted a
local model-cache warning before the run, but the run completed successfully;
the warning is retained as an environment observation and does not affect the
certification result.
