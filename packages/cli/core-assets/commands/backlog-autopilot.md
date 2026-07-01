---
description: Attended parallel backlog drain — work several independent Linear tickets at once, each in its own worktree subagent, reconciled into one integration PR. Opt-in, needs the Workflow tool.
argument-hint: "[--max-parallel 3] [--tickets DEV-1,DEV-2] [--target State] [--auto-merge] [--auto-merge-method merge|squash|rebase]"
---

Drive the `backlog-autopilot` skill (its launcher layer) to drain a small batch of
independent Linear tickets in parallel, attended.

Follow the skill's Layer 1 exactly:

1. Select eligible independent tickets via the Linear MCP (target state, not
   blocked by an open ticket). Honour `--tickets` if the user passed explicit ids,
   and `--max-parallel` (default 3) as the batch size.
2. Estimate each ticket's file footprint with a lightweight estimator subagent.
3. Compute the plan deterministically: pipe `{tickets, estimates}` as JSON to
   `void-harness backlog-autopilot plan` and read back `{parallel, sequential, excluded}`.
4. Show the plan — parallel group, sequential queue (with the reason each was
   sequenced), excluded — and **get the human's confirmation**. Do not fan out
   before they confirm; let them drop or move a ticket.
5. On confirmation, run the Workflow `workflows/backlog-autopilot.workflow.js` with the
   confirmed plan as args. It fans out one worktree subagent per ticket, then
   reconciles the green branches into a single integration PR gated by the full suite.
6. **If `--auto-merge` was passed**, follow the skill's risk-gated auto-merge step: gather the
   PR observations via `gh`, pipe them to `void-harness backlog-autopilot merge-decision
   --auto-merge [--auto-merge-method M]`, and act on `{arm}` — arm `gh pr merge --auto` when
   `arm:true`, else leave the PR for a human with the returned reason. Never resolve a conflict.

Remind the user this is opt-in. **Without `--auto-merge` they own the integration PR merge (do
not merge anything).** With `--auto-merge`, only a low-risk cluster on a protected base is armed;
everything else is left for a human. Requires the Workflow tool (deterministic multi-agent
orchestration); if it is unavailable, say so and stop. Relay the final result: the integration
PR, the included tickets, any excluded or blocked ones, and whether the merge was armed or why not.
