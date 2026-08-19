---
name: void-graph
kind: action
description: Read the installed harness as a graph and report what is dead, underused or expensive. No argument opens the local live studio; audit, cost and behavior print a terminal report.
owner: folpe
runtimes: [claude, codex]
disable-model-invocation: true
allowed-tools: Bash(void-harness:*) Bash(npx:*)
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# void-graph

The harness is a graph: skills, agents, hooks, and the edges between them. This reads that graph
against what actually ran here.

**Attribution**: see `.source`.

---

## When it fires

Only when a human asks. It answers a question about the harness itself, not about the work in
progress, and it costs a terminal for as long as someone reads it.

---

## Run it

Everything goes through the CLI, which every install has:

```
void-harness graph audit      # dead, dead-hook, underused, low-yield components
void-harness graph cost       # token weight per component
void-harness graph behavior   # what actually fired, against what was declared
void-harness graph live       # local studio, served on localhost, offline
```

`npx voidharness graph <sub>` when the binary is not on PATH.

For `live`, run it in the background so the session is not blocked, read the
`serving on http://localhost:<port>` line, and give the human that URL.

Everything is local. No npm, no network, no account. The analyzer reads the installed model and
correlates it with this project's own events under `.void/machine/runs/*/events.jsonl`.

> Do not reach for a path inside a plugin directory. The bundled analyzer used to be invoked
> through the plugin-root variable, which a runtime substitutes for plugin assets only: on a local
> install it stayed literal and pointed at nothing. The CLI is the one entry point that resolves
> on every channel and every runtime.

---

## Read it

Say what the report flags, and say what the reading can support:

- **dead / dead-hook** — declared and never observed. Which is a statement about the observation
  window, not about the component's worth. Give the window.
- **underused / low-yield** — observed rarely, or observed often for little effect.
- **expensive** — carries token weight out of proportion to what it returns.

Every finding is **advisory**. It is a candidate for trimming or tuning, never an instruction,
and nothing is applied from here.

If the report says the data is insufficient, that is the answer: the activation meter needs
enough sessions before absence means anything. `--min-sessions 1 --min-events 1` previews on a
single session and should be labelled as a preview when you show it.

---

## Red flags

| Rationalization | Reality |
|---|---|
| "It is dead, remove it" | It was not observed in this window. Removal is a human decision, taken with the reason it exists. |
| "Insufficient data, the command failed" | It reported an absence of evidence, which is a real answer and often the useful one. |
| "I'll run the bundled .mjs directly, it is faster" | That path only exists under a plugin install. The CLI resolves everywhere. |

---

## Composition

Adjacent: `void-audit` proposes what to do about staleness; this shows the shape it sits in.
Downstream: an accepted trim is filed through `learn`.
