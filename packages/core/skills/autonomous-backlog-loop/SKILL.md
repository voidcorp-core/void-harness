---
name: autonomous-backlog-loop
description: Opt-in loop that drains a Linear backlog ticket by ticket, each in a fresh session: pick, plan, execute, verify, ship. Ralph-style with HITL boundaries, never a default. Use when launched on purpose.
---

# autonomous-backlog-loop

A supervised-autonomous loop that drains a curated Linear backlog: one ticket per
**fresh** `claude` process, each running the full void craftsman cycle, then
exiting so the next ticket starts with a clean context. It is the harness's
distilled, HITL-safe answer to the "Ralph loop" (ghuntley) and to Boris Cherny's
"a session you can walk away from."

**This is never a default.** It runs only when a human launches
`void-harness backlog-loop` (or the `/void-backlog-loop` command inside Claude
Code). The harness default keeps the human in the loop (see
`verification-before-completion`). Read the Safety section before the first run.

**Attribution**: see `.source`.

---

## The flow (and why it differs from the naive version)

The intuitive flow is: *new session → next ticket → brainstorm → decide → plan →
execute → verify → close → clear*. That skeleton is right. Three deliberate changes
make it safe and durable:

1. **Fresh OS process per ticket, not just `/clear`.** A new `claude -p` invocation
   is a true context reset — the strongest defense against context-rot over a long
   run. `/clear` keeps process-level cruft; a new process does not. State survives
   in Linear and in on-disk plan files, never in conversation history.
2. **The human gates move to the boundaries, not the middle.** "HITL absolute" does
   not mean a prompt every ticket — it means the human owns the *edges*: they curate
   and approve the backlog (acceptance criteria = the approved spec) **before** the
   run, and they own the **merge** after. Inside the loop there is no human gate, but
   the blast radius is contained: work on a branch, open a PR, never auto-merge to a
   protected branch unless explicitly opted in.
3. **"Verify" is deterministic backpressure, not a vibe.** Tests/typecheck/lint/build
   are the only judge. A ticket that cannot go green is not closed — it is marked
   blocked with the failure evidence, and the loop moves on. No fake "done".

### Per-ticket cycle (one fresh session)

1. **Pick** the single most important eligible ticket (priority, then board order,
   then dependency order). Skip anything blocked by an open ticket. No eligible
   ticket → report `NO_TICKETS` and the loop ends.
2. **Don't assume it is unimplemented** — search the codebase first; build on what
   exists (Ralph rule).
3. **Brainstorm + decide** (`brainstorming`) from the ticket's acceptance criteria.
   Ground tool choices in official docs (`source-driven-development`). Structural
   choice with a rejected alternative → ADR (`adr-workflow`). Ambiguous criteria →
   ask in a comment, label `needs-criteria`, move on. Never invent scope.
4. **Plan** (`writing-plans`) to `.void/autonomous-runs/<id>.plan.md` — disposable,
   durable state on disk (`context-management`).
5. **Execute** test-first (`tdd`), atomic commits with "why" (`commit-discipline`).
6. **Verify** (`verification-before-completion`): green or blocked, never half.
7. **Ship**: open a PR. Move the ticket to the review state (human merges), or — only
   if `--auto-merge` — merge after CI is green and move to Done.
8. **Compound** (`compounding`): route any reusable lesson to feedback. Non-blocking.

---

## Ralph principles this loop encodes (and the ones it rejects)

Distilled from ghuntley's "how to ralph" and the get-shit-done context engineering:

- **Backpressure is deterministic.** The test suite decides what passes, not the
  model's self-assessment. Subjective checks (tone, UX) would need a judge pass;
  this loop sticks to mechanical gates.
- **The plan is disposable but persistent.** It lives on disk, survives a reset, and
  is cheap to regenerate. The conversation is not the source of truth.
- **Observe failure patterns; do not micromanage.** If the loop keeps blocking on the
  same class of problem, the fix is upstream — add a guardrail, a hook, a project
  rule via `compounding` — not a longer prompt.
- **Don't assume not-implemented.** Search before building.

**Rejected**: the unsupervised `while :; do cat PROMPT | claude --dangerously-skip-permissions; done`
form. Continuous commits to a protected branch with no human gate and no sandbox is
the antithesis of HITL-absolute. This loop opens PRs, keeps the security hooks live,
and only offers full-auto behind an explicit sandbox flag.

---

## Safety (read before running)

- **The floor is the allowlist + sandbox, not the hooks.** Each worker runs under a
  curated `allow`/`deny` permission profile (written to a temp settings file by the
  orchestrator) so a supervised run proceeds without prompts while everything unlisted
  is denied by default. This deny-by-default permission scope is the real safety
  boundary. The profile lives in the CLI (`packages/cli/src/lib/backlog/prompt.ts`,
  `AUTONOMOUS_SETTINGS`); tune `allow` to your toolchain there, never widen `deny`.
- **Hooks are guardrails on top.** `protect-sensitive-files` (deny-list of
  never-edit files) and `block-dangerous-bash` (best-effort blocklist of common
  footguns — it will miss novel forms, do not rely on it as the boundary) run on
  every call; the orchestrator refuses to start if their overrides
  (`VOID_HARNESS_ALLOW_*`) are set.
- **Subscription-billed, never the API.** The orchestrator strips `ANTHROPIC_API_KEY`
  / `ANTHROPIC_AUTH_TOKEN` from each worker's env so usage bills your Claude
  subscription, and refuses to start if a cloud-provider routing var would bill
  elsewhere (unless `--allow-api` is an explicit opt-in).
- **Clean tree required.** The orchestrator refuses to start on a dirty working tree.
- **Circuit breakers.** `--max` caps tickets per run; `--max-failures` consecutive
  errors stop the loop.
- **Full-auto is sandbox-only.** `--full-auto` (which passes
  `--dangerously-skip-permissions`) refuses to run unless `VOID_SANDBOX` is set. Run
  it in a disposable container with minimal credentials and restricted network. The
  question is not *if* an autonomous agent does something unintended, but what the
  blast radius is when it does.
- **No auto-merge by default.** Without `--auto-merge`, every change is left as a PR for
  human review. Use `--auto-merge` only when CI is a trustworthy gate and the work is
  low-stakes.

---

## Running it

```bash
# Supervised-autonomous (safe default): watch the live flux, it opens PRs.
void-harness backlog-loop

# Constrain the run:
void-harness backlog-loop --max 5 --target Todo

# Preview without spawning anything:
void-harness backlog-loop --dry-run

# Full auto, sandbox only:
VOID_SANDBOX=1 void-harness backlog-loop --full-auto --auto-merge
```

Or from inside Claude Code: `/void-backlog-loop --max 5`.

Config resolves from flags, then env vars (`LINEAR_SCOPE`, `TARGET_STATE`, ...),
then `.void/autonomous.json`, then defaults (`linearScope`, `targetState`,
`reviewState`, `branchPrefix`, `maxIterations`, `maxFailures`, `autoMerge`,
`model`). On a first run with no config file, an interactive wizard offers to
create one. The Linear interaction happens inside each worker session via the
Linear MCP, so that MCP must be connected. The orchestrator lives in the CLI
(`packages/cli/src/lib/backlog/`), streaming each worker's `stream-json` into a
live append-only flux and ending on a dense summary.

Optional turn-level backpressure: wire `scripts/stop-verification-gate.sh` as a Stop
hook in the run's settings (see the file header). It is intentionally not in the
core plugin.

---

## Rationalizations

| Rationalization | Reality |
|---|---|
| "Just let it run with `--dangerously-skip-permissions`, it's faster." | That removes the only floor you have. Use the scoped allowlist; reserve skip-permissions for a disposable sandbox. |
| "The model said the ticket is done, close it." | The test suite says done, not the model. No green, no close. |
| "Acceptance criteria are obvious, I'll let it infer them." | Inferred scope is invented scope. Missing criteria → block and ask. The human curates the backlog. |
| "One big session for the whole backlog is simpler." | Context rot degrades quality silently over a long run. One fresh process per ticket. |
| "Auto-merge everything, that's the point of autonomy." | Autonomy is in the *work*, not in bypassing review. Default to PRs; auto-merge is an explicit, low-stakes opt-in. |
| "It's looping on the same ticket, just rerun." | A repeated block is a signal. Fix it upstream (guardrail/rule), do not spin. |

---

## Verification

Before trusting an autonomous run, confirm:

- [ ] Backlog tickets have clear acceptance criteria (the approved spec).
- [ ] The Linear MCP is connected and scoped to the intended team/project.
- [ ] The `AUTONOMOUS_SETTINGS` `allow` profile (in the CLI) matches the project's real commands.
- [ ] Working tree is clean; you are not on a protected branch you fear to dirty.
- [ ] `--max` / `--max-failures` are set for the run's risk appetite.
- [ ] Full-auto, if used, is inside a sandbox (`VOID_SANDBOX`) with minimal creds.
- [ ] After the run: every PR is reviewed by a human before merge (unless `--auto-merge` was a deliberate choice).

---

## Composition

- **Upstream (human)**: `ticket-craft` (gstack) to write execution-ready tickets;
  `brainstorming` at the backlog level to shape what is worth doing.
- **Inside each session**: `brainstorming`, `source-driven-development`,
  `adr-workflow`, `writing-plans`, `tdd`, `verification-before-completion`,
  `commit-discipline`, `compounding`, `context-management`.
- **Downstream (human)**: `code-review` and gstack `/ship` / `/land-and-deploy` own
  the merge. This loop hands off PRs; it does not own production.

---

## Anti-rules

- MUST NOT run as a default or unprompted behaviour.
- MUST NOT merge to a protected branch without an explicit `--auto-merge` + green CI.
- MUST NOT close a ticket whose checks are red — block it with evidence instead.
- MUST NOT invent acceptance criteria — ask and move on.
- MUST NOT disable the security hooks or run full-auto outside a sandbox.
- MUST NOT keep working state only in the conversation — persist the plan on disk.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Loop exits immediately with NO_TICKETS | No ticket in `TARGET_STATE`, or all are blocked by open tickets. Check the Linear view + scope. |
| A ticket keeps getting blocked | Read the Linear comment evidence. Fix the upstream cause (criteria, a guardrail, a missing rule), not the prompt. |
| Run stalls waiting on a permission prompt | A needed command is not in the allowlist. Add it to `AUTONOMOUS_SETTINGS` `allow` in `packages/cli/src/lib/backlog/prompt.ts`. |
| It edited something it should not have | The allowlist is too wide or a hook is missing. Tighten `deny`; never set `VOID_HARNESS_ALLOW_*`. |

---

## Final rule

```
Human curates the backlog and owns the merge. The loop does the work in between,
one fresh session per ticket, green-or-blocked, on a branch, behind a PR.
Otherwise → it is not a void autonomous run.
```
