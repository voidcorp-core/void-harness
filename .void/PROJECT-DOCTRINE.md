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

## Quality bar

- **A flaky proof is invalid**: Before adding a gate, test, or abstraction, delete or fuse any
  existing proof that owns the same responsibility. A retry, raised assertion timeout, quarantine,
  or rerun must never turn a red gate green.
  - **Why**: Implement and Autopilot depend on green evidence as an absolute authorization. A
    probabilistic instrument can stop an autonomous run on chance or, worse, manufacture a false
    success.
  - **Enforced by**: test architecture, CI inventory gates, `void-testing`, `void-debug`, and code
    review.
