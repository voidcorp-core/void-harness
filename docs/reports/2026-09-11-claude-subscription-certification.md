# Claude Code subscription certification

Date: 2026-09-11
Ticket: DEV-812
Source commit: `0371a831f353cf9d9c644d5ac45ffe6ee0f1fbae`
Package: `void-harness@0.0.0`
CLI: `Claude Code 2.1.268`

## Result

The real Claude Code subscription execution passed with the exact marker
`SUBSCRIPTION_READONLY_CERTIFIED`.

- Session: `ac3c5d18-637f-4fd0-9a4f-520088509e4b`
- Outcome: successful, one turn, no permission denials
- Permission mode: `dontAsk`
- Tools: none
- Session persistence: disabled
- API/provider override variables: removed before launch
- Raw prompt, response and environment: not retained

The run returned a reported `total_cost_usd` field from the CLI. This is CLI
telemetry only; no API key or provider override was supplied, and the
certification path has no API budget.

## Attestation

This redacted attestation binds the ticket, CLI, package, source commit, session
identifier and observed marker. It is an integrity digest, not a cryptographic
signature.

`sha256:70bd7bc45c650e66f622a059acc726be3c94fb0a6cf1c701ed643b8a5f48dde6`

## Verification

- Targeted Claude adapter tests: passed.
- Eval harness typecheck: passed.
- Full repository test gate: passed.
- Harness self-host doctor: passed before the run.
- Official CLI contract rechecked against Claude Code headless and permission-mode documentation before launch.
