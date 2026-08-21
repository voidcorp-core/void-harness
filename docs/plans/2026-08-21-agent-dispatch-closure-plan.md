# Agent dispatch closure - Implementation Plan

**Goal:** make canonical specialist routing observable and executable on Claude Code and Codex,
without hard-coded roles or false certification.

**Spec:** `docs/specs/2026-08-21-agent-dispatch-closure.md`

**Mode:** strict TDD for parsers, joins, dispatch contracts and lifecycle reducers; souple TDD for
skill prose and CLI rendering.

## Slice 1 - Telemetry truth

- Add RED fixtures for Codex spawn tool variants and `agent_type`.
- Map native spawn tools to `agent:<name>` without retaining prompts.
- Make `telemetry-gap` depend on an intersection with installed names.
- Classify self-host and smoke mission IDs as synthetic at the behavior-analysis boundary.
- Expose excluded event/session counts in the report.
- Verify focused hook-runner, harness-graph and CLI tests.

## Slice 2 - Runtime-neutral dispatch contract

- Add RED tests for deterministic envelopes over every requested specialist.
- Reject duplicate, unresolved, versionless and non-canonical inputs as one failed action.
- Keep the Mission Engine pure: no filesystem, process, shell or runtime API.
- Export the minimal additive contract from `@voidcorp/mission-engine`.
- Verify controller and contract tests.

## Slice 3 - Explicit specialist lifecycle

- Add RED reducer tests for requested, started, completed and failed specialists.
- Permit review dispatch under degraded runtime capability while preventing `verified`.
- Keep unavailable capability blocking before dispatch.
- Remove the production `MVP_SPECIALIST_IDS` list; tests own any three-role fixture.
- Verify stale hash, wrong source, wrong contract and missing completion cases fail closed.

## Slice 4 - Runtime handoff

- Add a machine-readable CLI surface for the next team action and its envelopes.
- Persist enough immutable mission-plan context to resume safely.
- Add bounded commands to append start, completion and failure events.
- Update `void-implement` to iterate returned envelopes and use the native runtime agent primitive.
- Add conformance tests proving the same controller decision produces equivalent Claude and Codex
  handoffs.

## Slice 5 - Routing quality corpus

- Replace broad aggregate examples with at least 40 labeled cases and negative controls.
- Compute precision, recall, dispatch coverage, completion coverage and false greens.
- Gate deterministic metrics at 100 %.
- Keep paid/model-backed evals optional and separately reported.

## Slice 6 - Documentation, review and proof

- Align architecture and skill audit docs with the live dispatcher and telemetry boundary.
- Run architecture, security and QA specialist reviews; dispose every finding.
- Run focused suites, `pnpm derive:check`, and final `pnpm verify` on the final SHA.
- Commit each behavior slice with a Conventional Commit body explaining why.

## Checkpoints

1. Telemetry tests green before dispatcher work.
2. Pure dispatch contract green before CLI wiring.
3. Lifecycle and runtime conformance green before skill prose changes.
4. Full repository verification green before handoff.
