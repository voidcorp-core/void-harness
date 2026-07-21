---
date: 2026-07-21
title: "eval targets are slug-encoded in frontmatter; success_signal is optional, not mass-backfilled"
---

## 2026-07-21: eval targets are slug-encoded in frontmatter; success_signal is optional, not mass-backfilled

Phase A step A3 adds the last two authored fields of the capability contract. Two non-obvious calls:

**Eval targets are slug-encoded, not nested maps.** The model shape (spec §2) is a list of
`{ runtime, provider, tier }` cells. The credible alternative was to author them that way in
frontmatter — a YAML list of inline maps (`- { runtime: claude, provider: anthropic, tier: opus }`).
Rejected: parsing a list-of-maps with the repo's hand-rolled, regex-based frontmatter reader is
exactly the fragile surface the A2 review already flagged (silent "absent vs unrecognized-shape"
collapse). Instead the frontmatter authors one slug per cell — `eval_targets: [claude/anthropic/opus]`
— parsed by the **shared `parseList` helper** (the same one `runtimes:` uses) and split on `/` into
the structured `EvalTarget`. The model exposes the identical `{ runtime, provider, tier }` shape; only
the authoring surface is compact. A slug that is not exactly three non-empty parts is dropped
(tolerant), consistent with every other frontmatter parser here.

**`success_signal` is optional and not mass-backfilled.** Unlike `owner: folpe` (uniformly *true* —
one maintainer owns everything today), a uniform `success_signal` across 64 skills would be a
dishonest placeholder: the "what good looks like" signal is genuinely per-skill content. So the field
is optional, absent until authored per capability, and never governance-gated. `eval_targets` is
backfilled uniformly to the primary `claude/anthropic/opus` cell (the tier the skills are authored
for — a real declaration of intent), while codex/other cells are added only when a capability actually
declares support for evaluation there.

Also folded in: the A1 review nit — with `success_signal` as the third scalar frontmatter field, the
`parseScalar(block, key)` helper was extracted and `owner`/`success_signal` now share it (three was
the stated YAGNI line for de-duplicating the copy-paste, not two).

Why: keeping the authoring surface parseable by the existing tolerant reader (no new YAML dependency,
no list-of-maps regex) preserves the "frontmatter is the one source of truth" decision while avoiding
the fragile-parser trap; and refusing to fake `success_signal` keeps the capability contract honest —
a populated field must mean something, or the five-state model's credibility erodes.
