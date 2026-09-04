# PROJECT-DOCTRINE.md

What is true of **this** project and could not be inferred from the code: its domain vocabulary,
the trade-offs already settled, the rules it has paid for. Loaded into every session, so write
only what you want read every time.

This file is yours. `void-harness init` creates it, and never overwrites one you have written in.
Universal rules live in `.void/installed/PHILOSOPHY.md` and belong to the harness.

Say a rule out loud — "ajoute la règle…", "always X here", "never Y" — and `void-learn` proposes
the wording, waits for your yes, then writes it here. Sections appear as you use them.

Full format, with the shape of each section:
https://github.com/voidcorp-core/void-harness/blob/main/docs/PROJECT-DOCTRINE-FORMAT.md

## Trade-offs already decided

- **Portable control-plane invariants**: The void-harness kernel is a local-first,
  subscription-first, proof-carrying control plane. Executable manifests, deterministic then
  semantic routing, authority outside the LLM, idempotent effects, complete proofs, separated
  memory, reversible recovery bounded to three strategies, and crash-injection certification are
  invariants that no migration or optimization may weaken.
  - **Why**: Reliability is the primary criterion. Any divergence from the state of the art must
    constitute a verifiable advance.
  - **Enforced by**: approved specification and ADR, conformance and fault-injection tests, and
    architecture review.
  - **Specification**: `docs/specs/2026-09-04-void-machine-foundation.md`.
  - **Decisions**: `adr:d1ebefa6-e01c-4812-8eda-e2b7769fde28`,
    `adr:e88fecff-e351-4a4c-a584-76966830e141`,
    `adr:9da29673-e02c-4800-82ba-9cadc53e79f8`,
    `adr:67b69dd3-9ed3-4ab7-9bc2-c5202f97da6b`,
    `adr:d8d55093-aae9-4969-b369-651336d6ab81`,
    `adr:170a721b-785a-4130-b3b9-9a103af6e2d9`,
    `adr:4563663a-4b6a-4071-80b1-ceb654074370`, and
    `adr:6cea37a0-5fdc-4fea-9be2-4b497d15c3a4`.
