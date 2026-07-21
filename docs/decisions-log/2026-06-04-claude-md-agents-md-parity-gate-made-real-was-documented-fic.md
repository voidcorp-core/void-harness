---
date: 2026-06-04
title: "CLAUDE.md <-> AGENTS.md parity gate made real (was documented fiction)"
---

## 2026-06-04: CLAUDE.md <-> AGENTS.md parity gate made real (was documented fiction)

Context: CLAUDE.md, AGENTS.md, ARCHITECTURE.md and the design plan all cited
`scripts/sync-agent-docs.sh` as a live pre-commit gate enforcing sister-doc
parity. The file did not exist, and there was no git-hook tooling at all
(no husky/lefthook/prepare). The parity claim was unenforced.

Decision: write `scripts/sync-agent-docs.sh` with two modes — `--staged`
(pre-commit XOR: a change touching one sister doc must touch the other) and the
default structure mode (section-heading parity after normalizing the known
terminology variants, stateless so it runs in CI). Wire it via `.githooks/pre-commit`
(opt-in `git config core.hooksPath .githooks`) and a CI step (`pnpm sync:docs`).
Tested in `test/sync-agent-docs/`.

Alternatives rejected:
- A full semantic doctrine-diff: the routing tables legitimately differ in
  content (not just terminology), so a content diff would false-positive.
  Heading parity + the both-or-neither rule is what the headers actually promise.
- Deleting the claim from the docs instead of implementing it: cheaper, but the
  parity rule is worth keeping; make it true rather than drop it.
