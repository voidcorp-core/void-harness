---
date: 2026-07-21
title: "`trim-large-output` PostToolUse hook -- cap oversized tool output, spill the full to disk"
---

## 2026-07-21: `trim-large-output` PostToolUse hook -- cap oversized tool output, spill the full to disk

Context: measured, not assumed. Decomposing two real heavy feature sessions (peak
context 848k and 965k of 1M) by token category showed the driver of context growth is the
implementation loop, not code exploration: Bash/build/test output (14-27%), MCP payloads
(Linear, up to 26%), and the agent's own Write/Edit output (20-29%). File exploration is
already delegated to subagents, so a code-graph/"graph-first recall" tool (Graphify) would
reclaim only a slice of the 12-18% Read bucket (~single-digit %). The fat, reducible buckets
are verbose Bash output and large MCP results.

Decision: a single PostToolUse hook (`hooks/trim-large-output.sh`, matcher `*`) that, when a
**Bash or MCP** result exceeds a threshold (`VOID_HARNESS_TRIM_BYTES`, default 12000c), writes
the FULL output to `.void/outputs/<...>.log` and returns via `updatedToolOutput` a trimmed
view: head + tail + the error-ish lines grepped from the elided middle + a pointer to the
spill file. The mechanism is confirmed on the official hooks doc (`updatedToolOutput` replaces
the tool result before it reaches the model) and the repo already reads `.tool_response` in
`outcome-meter.sh`.

Safety by construction: never touches `Read`/`Edit`/`Write` results (the agent needs the whole
file it is about to edit -- trimming those would make it work blind); PostToolUse so execution
is never altered; fail-OPEN on any uncertainty (no jq, unparseable response, write failure ->
original passes through); full output always preserved on disk, so nothing is lost.

Rejected alternatives. (1) Blind global cap of every tool output -- unsafe, would truncate a
file the agent is mid-edit on. (2) PreToolUse command-rewrite (`updatedInput`) to self-truncate
Bash -- alters execution, breaks commands using pipes/redirects/heredocs/exit codes; safety
pillar says do not touch execution to save tokens. (3) Per-command wrappers (`void test` etc.)
-- one global hook covers Bash + MCP uniformly, no per-tool wrapper zoo. (4) "Run everything
costly in a subagent" (the user's first framing) -- a subagent still reads the full output in
its own window and costs a model call to summarize deterministic logs; a filter is strictly
cheaper for verbose non-judgment output (subagents stay the right tool for judgment-heavy MCP
reads). Not mirrored into Codex `hooks.json`: that manifest is the Codex safety floor, and
`updatedToolOutput`/`tool_response` support there is unverified. One unverified link remains --
whether the installed Claude Code version honors `updatedToolOutput` end-to-end -- to confirm
with a live smoke test before relying on it.
