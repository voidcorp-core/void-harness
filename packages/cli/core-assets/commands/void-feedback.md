---
description: Capture a void-harness feedback note (a gap or friction in the harness) into .void/harness-feedback/proposed/ for later promotion. HITL — proposed, never auto-applied.
---

The user hit something the harness should handle better (a missing skill, a
false-positive hook, a missing rule, a DX papercut). Capture it as an inbound
self-evolution note, do not fix the harness from here.

1. Infer the gap from the recent conversation (or ask one short clarifying
   question if it is unclear).
2. Write a markdown note to `.void/harness-feedback/proposed/<YYYY-MM-DD>-<n>.md`
   with frontmatter `date`, `source`, `kind` (skill | hook | rule | dx),
   `severity` (minor | medium | major | critical), `status: proposed`, then a
   5-15 line body: what happened, the evidence, and a "What would unblock me"
   line.
3. Show the note to the user and confirm. Do not push or open an issue — that is
   `void-harness feedback push`, run deliberately later.

This is the `harness-evolution` inbound flow. Keep it HITL: propose, never write
into harness doctrine automatically.
