---
date: 2026-06-01
title: "test key/token fixtures are generated at runtime, gitleaks stays as-is"
---

## 2026-06-01: test key/token fixtures are generated at runtime, gitleaks stays as-is

Context: same field feedback. The repo's gitleaks `generic-api-key` rule (NOT a
void-harness hook) flagged a hardcoded base64 `encryptionKey` test fixture and
blocked the commit — gitleaks decodes base64 and scores its entropy.

Decision: do NOT add a `*.test.ts` allowlist to `.gitleaks.toml`. A blanket
path allowlist is a security hole (real leaked secrets in a test file would pass
unscanned). The convention instead: test fixtures for keys/tokens are generated
at runtime (`crypto.randomBytes`) or use low-entropy placeholders — never a
hardcoded high-entropy base64 literal. This keeps the scan at full strength and
removes the false positive at the source.

Scope note: this is a convention for harness-consuming projects, not a code
change in this repo. Logged here because it is a deliberate "don't weaken the
gate" decision with a credible (and rejected) alternative.
