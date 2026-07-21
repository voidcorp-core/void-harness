---
date: 2026-07-09
title: "forge → harness is an artifact contract on a core-hub, not a plugin dependency (issue #76)"
---

## 2026-07-09: forge → harness is an artifact contract on a core-hub, not a plugin dependency (issue #76)

Forge (ideation) previously dangled its downstream handoff at gstack `/ticket-craft` — a dead pointer
once gstack is being removed. Folpe's inter-plugin decision: the **core plugin is always installed
and is the hub**; forge routes into the core's execution skills (`brainstorming`, `writing-plans`,
`ticket-writer`, `tdd`, ...). The interface is a **versioned markdown artifact contract** the harness
owns the format of (`docs/specs/*.md`, frontmatter `source: forge` + the 18 recon variables + winning
design + critique verdict), so each plugin still stands alone: forge degrades to emitting a standalone
spec, core works from a hand-written one. `brainstorming` / `writing-plans` / `ticket-writer` ingest a
`source: forge` spec instead of re-asking; partial or older-version specs are tolerated (fill the gaps,
list what is missing).

The credible alternative was a hard plugin dependency (forge `requires` core). Rejected: it breaks
forge's standalone value and couples release cadences; a contract on a file gives the same nominal
routing without the coupling. Re-splitting core into `core` + `dev` (execution) sub-plugins is
explicitly **deferred (YAGNI)** — one core-hub is enough until a second consumer of the execution half
exists.

Why: the artifact contract is the loosest coupling that still lets forge hand real work to the core
without re-deriving it, and keeps the "each plugin makes sense alone" property that the marketplace
model depends on. The forge side lives in `voidcorp-core/forge` (forge#4).
