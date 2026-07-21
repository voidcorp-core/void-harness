---
date: 2026-06-04
title: "review fixes round 3 + honest reframe of the \"safety floor\""
---

## 2026-06-04: review fixes round 3 + honest reframe of the "safety floor"

Context: a multi-agent review of the PR found real holes, three of which were the
same systemic defect: a control duplicated across two representations where one
copy was updated and the mirror forgotten.

Confirmed-live fixes:
- **block-dangerous-bash** missed capital `-R` (`rm -Rf /`, `rm -R ~`) because the
  recursive clause matched lowercase `r` only while chmod used `[rR]`. Now `[rR]`.
- **protect-sensitive-files** let Codex's `shell` argv-array payload through (only
  a string command was handled, though its sibling block-dangerous-bash already
  handled arrays). Now joins arrays before scanning, and matches filenames
  case-insensitively (`.ENV`, `Credentials`, `.KEY` on a case-insensitive FS).
- **install --global** built the global manifest from a hardcoded 9-hook map that
  had drifted from plugin.json (shipping a global install with none of the new
  hooks). Now derives the hook wiring verbatim from the committed plugin.json
  (commands already use ${CLAUDE_PLUGIN_ROOT}), so it can never lag again.
- **autonomous-backlog render_prompt** used `sed s|...|$VALUE|`, which a `|`/`&`
  in a free-text config value (LINEAR_SCOPE) would corrupt, silently
  circuit-breaking the loop. Switched to bash parameter-expansion replacement
  (values treated literally).
- **doctor** now checks AGENTS.md, not only CLAUDE.md (the PR made AGENTS.md a
  maintained sister doc).

Design reframe (the important one):
- **block-dangerous-bash is reframed from "non-skippable safety floor" to a
  best-effort guardrail.** A regex blocklist of catastrophe shapes will never be
  complete (three review rounds found $HOME, -R, find -delete, git push +) and
  gives false confidence. The real deny-by-default floor for unattended runs is
  the scoped allowlist + sandbox (settings.autonomous.json). The hook is the
  secondary tripwire. docs/CODEX.md and the autonomous skill now say so.

Removed as inert:
- **precompact-doctrine hook deleted.** PreCompact has no decision control and
  cannot inject additionalContext (per the hooks docs), so the re-injection never
  happened. SessionStart fires with source `compact` after a compaction and DOES
  support additionalContext, so sessionstart-context already covers it. Shipping
  an inert hook is the same "documented fiction" anti-pattern we keep removing.

Alternatives rejected:
- Extend install.ts's hardcoded hook map instead of deriving from plugin.json:
  keeps the duplication that caused the drift. Derive from the single source.
- Keep block-dangerous-bash labeled a "floor": dishonest about a leaky blocklist;
  trains operators to keep the all-or-nothing override on.
