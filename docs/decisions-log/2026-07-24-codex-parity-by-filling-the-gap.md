---
date: 2026-07-24
title: "Codex parity is reached by filling the gap, not by declaring it unsupported"
---

## 2026-07-24: Codex parity is reached by filling the gap, not by declaring it unsupported

A Codex-wired project received **2 enforcement hooks where a Claude one received
18**, and none of the 5 read-only agents. An external audit proposed closing this
by *declaring* it: a `requires:` field on skills plus an `unsupported` capability
state, so `status` would honestly report what a runtime cannot do.

Rejected. Declaring a gap documents it; it does not close it, and it makes
"multi-runtime" mean "Claude, plus a degraded second runtime". The chosen path is
the opposite: **diff what Claude actually receives against what Codex receives,
and fill the difference**, keeping `requires`/`unsupported` for the residue that
genuinely cannot be filled.

The diff, once measured against the official Codex docs:

| Artifact | Codex before | Resolution |
| --- | --- | --- |
| Skills | staged (core + packs) | already at parity |
| Hooks | 2 of 18 | filled: full mirror |
| Agents (5) | none | filled: compiled into Codex skills |
| Commands (5) | none | non-issue: 1 is already a skill, 4 wrap a runtime-agnostic CLI |

### Why the hooks were not a config change

The blocker was not the manifest. The content-scanning hooks read
`.tool_input.file_path` + `.new_string` — Claude's **single-file** `Edit`/`Write`
shape. Codex edits via `apply_patch`, a **multi-file diff**. Wiring the hooks as-is
would have fired them against an empty payload: they would have passed everything
while reporting green. **A wired-but-dead hook is worse than an honest absence**,
because it removes the pressure to fix what it pretends to cover.

So `_hooklib.sh` gained `hooklib_edits`, a runtime-agnostic stream of one
`<path, new-content>` record per edited file, and the content-scanning hooks
iterate it. Only added (`+`) lines are collected, and every file in a patch is
scanned — not just the first.

### Why the agents are compiled, not re-authored

Codex has no stable subagent to spawn (experimental), and its custom prompts are
deprecated in favour of skills — which are also `~/.codex`-only, never repo-local.
So skills are the target form. Two ways to get there:

- **hand-write 5 SKILL.md files** — duplicates each agent's doctrine body, giving
  one capability two sources guaranteed to drift, and trips the repo's
  no-responsibility-overlap rule;
- **compile the existing agent definitions at wire time** — chosen. One authored
  doctrine per capability, rendered per runtime, which is precisely what the
  runtime seam exists for.

Degradation stated in the compiled file itself: Codex gets the capability, not the
context isolation.

### What is deliberately still missing

`trim-large-output` is **not** mirrored. Its `PostToolUse` output rewriting
(`updatedToolOutput`) is unconfirmed on Codex and a sibling field is documented as
failing there, so wiring it would spill files to disk for no context benefit. The
irreducible residue (Workflow tool, claude-in-chrome, unpublished `make-pdf`,
subagent isolation) is tabled in `docs/CODEX.md` — that is where the notion of a
prerequisite keeps its meaning.
