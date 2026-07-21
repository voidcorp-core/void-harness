---
date: 2026-06-04
title: "resolve the pack .source debt (backfill all + gate it)"
---

## 2026-06-04: resolve the pack .source debt (backfill all + gate it)

Context: 27 pack skills lacked a co-located `.source`, leaving the "one .source
per skill" rule violated and unenforced — the same rules-rot pattern as the
sync-agent-docs fiction.

Decision: chose backfill-all over exempting packs. The load-bearing reason: a
`.source` ships with the skill (it lives under packages/**/skills/<name>/ and is
distributed via the marketplace), whereas the audit note in plans/ does not. So
`.source` is the *provenance that travels to consumers* — pack skills ship too,
so exempting them would ship skills without provenance. A uniform rule also
avoids an asterisk in the doctrine.

- Backfilled all 27 pack `.source` files, derived strictly from each skill's
  existing audit note (no fabricated URLs). Finding: most pack audits, unlike
  core, have no "Sources audited" table — those skills are genuinely `native`
  concretizations of a pack module, recorded honestly as such.
- Added an anti-bloat gate: every skill (core + packs) must have a co-located
  `.source` AND a plans/skill-audits/<name>.md note. Verified fail-closed.

Alternatives rejected:
- Exempt pack skills from `.source` (audit-note-only): ships pack skills without
  travelling provenance, and adds a special-case to the rule.
- Auto-generate `.source` without reading the audits: risks fabricated
  attributions. Derived from the real audit content instead.

Follow-up (optional): pack audit notes lack the "Sources audited" table the core
notes use; backfilling those tables with real upstream doc URLs would enrich the
provenance further. Not blocking.
