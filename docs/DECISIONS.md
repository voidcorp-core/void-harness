# Decisions log

Non-obvious decisions taken on the harness itself, where a credible alternative
existed. One entry per decision. Newest first. See CLAUDE.md meta-rules.

## 2026-07-06: behavior `telemetry-gap` finding -- collapse a whole unrecorded firing kind, don't cry N dead-nodes

Context: three telemetry blind spots in a row (doctrine `activation`, workflow `scriptPath`,
`Agent` vs `Task`) were the same shape -- the recorder and the graph node derive their join
key independently and nothing checks they agree. Finding the fourth by accident is not a
strategy. The `Agent` bug in particular surfaced as five separate `dead-node` findings (one
per agent), which is exactly how it got misread as "these agents are under-used".

Decision: a compounding guard in the behavior kernel. When a whole `ActivationKind` has >= 2
firing-capable, non-`always` nodes but zero recorded activations, emit one `telemetry-gap`
finding (listing those nodes, pointing at the recorder) and suppress their `dead-node`
findings. A whole kind at zero is far more likely a join-key break than every component of
that type being independently dead.

Two design points. (1) Threshold >= 2: with a single node, "kind unrecorded" is
indistinguishable from a genuinely dead component, so a one-node kind stays a `dead-node`
(this is why the workflow kind, one node today, is not gap-covered -- acceptable, it gains
coverage the day a second workflow-def exists). (2) `always` nodes are excluded from the
count: they are exempt from dead regardless, so they are no evidence of a recorder break.
Rejected alternative: emit the gap *in addition to* the per-node dead-nodes -- that keeps the
noise the guard exists to remove. The guard self-extinguishes: once the recorder is fixed and
the kind records activations, the gap disappears and normal per-node analysis resumes.

## 2026-07-06: activation-meter counts `Agent` spawns, not just `Task` (third telemetry blind spot)

Context: the activation-meter classified an agent spawn only when `tool_name == "Task"`,
the stock Claude Code name. This harness exposes the spawn tool as `Agent`, so every agent
launch fell through to `kind: tool, name: "Agent"` and no `kind: agent` event was ever
recorded. Consequence: every `agent:*` node was permanently `dead` in behavior/cost, not
because the agents are unused but because the meter never saw them fire (13 `Agent` tool
events sat mislabeled in one local log while all five agent nodes read dead).

Decision: accept both names (`$tool == "Task" or "Agent"`, `Task|Agent)` in the jq-less
path). No credible alternative -- this is a join-key bug of the same family as the workflow
`scriptPath` fix (2026-07-04, Decision 2), logged here only because it materially corrects an
earlier read: the consumer report's "specialized agents never spawned" signal
(code-explorer, doctrine-critic, migration-planner, silent-failure-hunter,
type-design-analyzer) was a measurement artifact, not real under-use. Do not conclude "these
agents are dead / should be trimmed" from pre-fix telemetry.

## 2026-07-04: graph cost/behavior liveness -- `activation` frontmatter over enforces-edge inference; two telemetry blind spots closed

Context: the consumer cost report flagged doctrine skills (`tdd`, `security-guidance`,
`commit-discipline`, ...) as `dead` / `low-yield`. Root cause: the activation-meter is a
PreToolUse hook, so it only records a `skill` event when a skill is invoked through the
Skill tool. Doctrine skills are never invoked that way -- their rule is carried passively
via `@.void/PHILOSOPHY.md` + enforcing hooks -- so `invocations` is permanently 0 and
`staticTokens` (the full SKILL.md size) is charged as if paid every session, which it is
not (only PHILOSOPHY's summary is resident; the SKILL.md loads only on invocation). A
second blind spot: a workflow launched by `scriptPath` recorded `name: "inline"`, never
matching the filename-derived `workflow-def` node, so it read as `dead` regardless of runs.

Decision 1 -- a node declares its activation mode in frontmatter: `activation: always`
(doctrine followed passively) vs the default `on-demand` (a workflow triggered actively).
A node marked `always` is exempt from `dead` / `underused` / `low-yield` and carries a
positive `always` flag instead; it stays eligible for `expensive` (a real-cost fact). Same
reasoning the cost kernel already applied to hooks, whose liveness is structural, not
invocational.

The tag is granted only on **auditable structural backing**, not on a subjective "feels like
doctrine". A skill is `always` iff its rule genuinely operates without a Skill-tool invocation,
which requires one of two verifiable proofs: (a) it is the target of an `enforces` edge (a hook
runs it mechanically every commit), or (b) its principle is stated explicitly in
`PHILOSOPHY.md` (resident in the system prompt). This yields **16 always / 15 on-demand**:
- 14 backed by an `enforces` edge: accessibility-first, code-review, commit-discipline,
  domain-driven-design, frontend-design, functional, hexagonal-architecture, llm-cost-discipline,
  migrations-safety, observability, refactoring, security-guidance, testing, typescript-strict.
- `tdd` -- backed by the `tdd-guard` hook; this change adds the missing
  `enforces: tdd-guard -> tdd` edge so the backing is declared, not implicit.
- `source-driven-development` -- backed by the PHILOSOPHY hard rule "Read the official
  documentation of any third-party tool BEFORE writing its config".

An earlier, broader cut (21) also tagged async-safety, api-and-interface-design,
context-management, systematic-debugging, verification-before-completion. Rejected on review:
those five have neither an `enforces` edge nor a PHILOSOPHY line, and their own descriptions are
conditional ("Use for async/webhook/job/cron code"). Tagging them `always` would stamp a
genuinely unused, unenforced skill as healthy forever -- the exact blind spot this change fixes,
inverted. They stay `on-demand`; any of them earns `always` only once given a real backing (a
hook or a PHILOSOPHY line), never before.

Alternative rejected -- infer "always-loaded" from the existing `enforces` edges (a skill
that a hook enforces). Rejected: it is a proxy for a different property ("enforced by a
hook"), not "followed passively as doctrine". They correlate today but decouple tomorrow
(a hook enforcing a non-PHILOSOPHY skill, or the reverse), and it structurally misses `tdd`
(no declared `enforces` edge) and any doctrine skill without a hook. Encoding the mode
explicitly on the node is the honest fix; deducing it from a proxy re-introduces the same
class of lie. `backlog-autopilot` is enforced yet stays `on-demand`, confirming the proxy
would misclassify.

Decision 2 -- the activation-meter derives a scriptPath-launched workflow's name from the
script basename (strip `.workflow.js`), matching the `workflow-def` node id, before falling
back to `inline`. The fix is prospective (past log lines keep their recorded name).

Why: a telemetry signal that mislabels doctrine as dead would, via `void-audit`, propose
deprecating load-bearing skills -- the blind spot was not cosmetic, it was a trap that could
drive a wrong cut. The whole A->B->C self-optimization loop depends on the measurement
telling the truth about what the harness actually runs.

## 2026-06-29: graph behavior (M8) -- declared triggers, behavior separate from analyze, advisory only

Context: M8 turns the accumulated activation log (M6) into "which components never
fire" (dead-node) and "which skills should have fired but did not"
(should-have-fired). Spec: `docs/specs/2026-06-29-graph-behavior-m8.md`.

Decision 1 -- skills declare machine-readable `triggers` (`globs` / `extensions` /
`tools`) in their SKILL.md frontmatter; matching is mechanical and deterministic.
Alternatives rejected: lexical keyword heuristic over the NL `description` (noisy,
non-deterministic relevance) and an LLM/embeddings judge (cost, non-determinism,
off-CI). Declared triggers are opt-in and incremental -- a skill without triggers is
simply excluded from should-have-fired (zero false positives), and the NL-matching
problem becomes a mechanical one.

Decision 2 -- `analyzeBehavior` is a separate pure module (`behavior/`), not another
`analyze` detector. The behavioral data is temporal (per session), unlike the static
model `analyze` consumes. Keeping it separate avoids threading session state through
the static detectors and keeps `graph check`'s CI gate purely structural.

Decision 3 -- advisory only (`severity: info`, never joins `blockingFindings`), with a
volume guard (~3 sessions / ~20 events) so a sparse log does not read as "everything
is dead". dead-hook (wiring vs situations from plugin.json matchers) and semantic
matching are deferred. Matches the spec's "analysis is a signal (HITL); only
broken-route blocks CI".

## 2026-06-29: harness-graph joins the version lockstep

Context: the `@voidcorp/harness-graph` kernel (merged in #41) shipped with a real
version (0.12.1) but was wired into neither the release-please `extra-files` nor
`scripts/check-version-lockstep.mjs` (`NPM_PACKAGES`). It would have stayed at
0.12.1 while everything else bumped to 0.13.0 -- a silent drift, uncaught because
it was also excluded from the drift check.

Decision: add `packages/harness-graph/package.json` to BOTH the release-please
extra-files and `version:check`, so the kernel bumps in lockstep with the rest.
This matches the CLAUDE.md doctrine ("release-please bumps every manifest in
lockstep") and the kernel already sat at the lockstep version. Alternative
rejected: version the kernel independently (own publish cadence, like the
deliberately-excluded `apps/graph-studio`). Rejected because nothing indicated an
independent cadence -- the omission was forgotten wiring at #41, not a policy.

## 2026-06-29: graph live (P2) -- meter records `kind=tool`, SSE is data-only, one `frameAt` for live+replay

Context: P2 "live" (the `is` layer) needed three coupled decisions, each with a
credible alternative. Spec: `docs/specs/2026-06-29-graph-live-p2.md`.

Decision 1 -- the activation meter records `kind: skill|agent|workflow|tool`, NOT the
`skill|agent|hook|workflow` the parent spec (§8) listed. A universal `PreToolUse *`
hook observes tools, never hooks; logging "which hook fired" would force every hook
to self-log (fragile meta-logging, N files). Instead it records situations
(`kind=tool` + `trigger.fileGlobs/ext`); "should this hook have fired" is derived in
M8 by matching situations against declared triggers. The single `activation-meter.sh`
absorbs the old `skill-usage-meter.sh` and keeps writing `usage.log` for skills
(audit + studio halos unchanged).

Decision 2 -- `graph live` serves data only (`/model.json`, `/history`, `/events`
SSE); it does NOT bundle the studio `dist`. The studio stays a separate app and
connects via `VITE_LIVE_URL`. The HTTP contract is a strict superset of the future
all-in-one server, which only adds `GET / -> dist` later -- a non-breaking addition.
Alternative rejected: bundle the studio dist into the CLI now. That forces a
cross-package build + asset-mirror gate for zero behavioural gain at this stage;
deferred to a dedicated packaging increment once the behaviour is locked.

Decision 3 -- live and replay share one pure function `frameAt(events, cursor,
window)`. Live pins the cursor to now (fed by the SSE stream); replay detaches it to
the scrubber position over `/history`. One calculation, two pilots -- no duplicated
intensity logic. Alternative rejected: a separate live pulser + replay renderer; it
duplicates the decay math and drifts.

Also: `null` was avoided throughout (harness:functional) -- parse/lookup return
`undefined`.

## 2026-06-29: graph-studio is orchestrator-centric with progressive disclosure, not a flat force-cloud

Context: the first graph-studio build rendered all 102 nodes as a single
3d-force-graph force-directed cloud (spec §7's literal "clusters spatiaux par pack").
In use this was beautiful but illegible: it answered "what exists / where is it
dense" but not "how does the harness articulate" -- the edges (the actual relations)
were drowned, and a force layout encodes neither hierarchy nor flow. Dogfooding
feedback: "c'est compliqué de comprendre comment tout s'articule."

Decision: re-centre the view on the orchestrator (CLAUDE.md / the routing doctrine)
and use progressive disclosure instead of showing everything at once. The
orchestrator sits at the centre; group hubs (core + each pack) orbit it in a 3D
volume; components are collapsed by default (overview = ~8 labelled hubs with count
badges); clicking a hub expands its components; clicking a component isolates its
ego-network (focused node + its semantic neighbours + directional arrows, rest
hidden). This is the agent-flow "few nodes at a time, drill down" model. The
holographic aesthetic (bloom, fog, reticle, gravitation spin) is retained but tuned
down for legibility.

Alternative rejected: keep the flat force-cloud and only tune bloom / add focus.
Tried; the all-102-at-once layout stays cluttered because `core` alone has ~68
components. Progressive disclosure is the only way to have both the full graph and
legibility. The pure articulation overlay (`src/scene/articulation.ts`: orchestrator
+ hubs + containment + 3D orbital layout + ego-network) is unit-tested; spec §7's
pack-cluster wording is superseded by this entry.

## 2026-06-26: "secrets via env" carves out customer-provided (BYO) credentials

Context: an ADR audit of a consumer project (sesame, multi-tenant) surfaced a case
the doctrine handled wrong (issue #34). `PHILOSOPHY.md` and `security-guidance`
stated "secrets via env / no secret in the DB" without qualification. That is
correct for the app's OWN infra secrets, but wrong for a credential the customer
provides (a BYO API key, e.g. a per-tenant data-source key): env holds one value,
not one-per-tenant, so the absolute rule pushes a developer to either jam a key
into env (does not scale past one tenant) or store it plaintext (a DB dump leaks
every customer's credential).

Decision: add a single narrowly-scoped exception (not a new skill, not a mode). A
customer-provided credential is application **data** — store it encrypted at rest
per tenant (AES-256-GCM), keep the master key in env, never return it to a client
(masked last-four). The app's own secrets still go in env, never the DB. Recorded
in `PHILOSOPHY.md` (the hard rule), the `security-guidance` skill (a Secrets
subsection), and the skill audit.

Alternatives rejected: (a) leave the rule absolute — keeps it wrong for a real,
recurring multi-tenant case; (b) a dedicated "secret storage" skill — anti-bloat
overkill for a one-clause carve-out that belongs next to the rule it qualifies.

Why: a rule stated more absolutely than it is true trains developers to either
break it or mis-apply it; the carve-out is sourced from a validated PROJECT-DOCTRINE
rule (sesame ADR 57), so it is doctrine earning its way up, not speculation.
## 2026-06-26: file harness feedback directly as issues, drop the in-project `proposed/` queue (issue #35)

Context: `harness-evolution` (feedback mode) captured a perceived harness gap to
`.void/harness-feedback/proposed/YYYY-MM-DD-N.md` **inside the consumer project
repo**, then required a second step (`void-harness feedback push`, shipped
2026-06-19, cluster C) to walk the queue and file each note as a GitHub issue on
this repo. This put harness concerns in the wrong repo's git history and
duplicated a triage system that already exists: the GitHub issue tracker. A
per-repo markdown queue is a strictly worse reimplementation of an issue tracker
(no labels, no cross-project visibility, buried in each consumer's `.void/`).

Decision: replace the queue with **direct issue creation** on
`voidcorp-core/void-harness`.
- The skill / `/void-feedback` command drafts an issue, confirms it with the
  user, then opens it with `gh issue create` (label `enhancement`), carrying
  source-project context (repo, SHA, file path, motivation).
- The tracker is the triage zone: taking the issue promotes it, closing it
  declines it. No `proposed/` / `promoted/` / `discarded/` / `deferred/`
  bookkeeping, no `feedback push` step.
- Removed: the `feedback` CLI command (`packages/cli/src/commands/feedback.ts`),
  its pure builders (`lib/feedback.ts` + test), the `HARNESS_REPO` const (its
  only consumer), the help entry, and the `.void/harness-feedback/proposed/`
  convention from the skill and docs.

Why this preserves HITL: an issue is a proposal, not a doctrine write. HITL is
about not auto-MERGING a PR, not about not opening an issue, so creating the
issue directly does not weaken the gate. This reverses the 2026-06-19 decision to
*implement* `feedback push`: that command made the then-documented two-step real,
but the two-step itself was the misplaced ceremony.

The one caveat (deliberate discipline shift): the queue's only real value was a
pre-filter against noise in this tracker. Going direct moves that filter from
"before the issue exists" to "triage by close". Cheap for a single-maintainer
repo, but it makes the agent's **filing bar load-bearing**: file only when the
item is both *agnostic* (helps any consumer) and *harness-worthy* (changes a
skill / hook / pack / CLI / doctrine line); project-specific rules go to
`.void/PROJECT-DOCTRINE.md` via `capture-rule`. The reference bar is the #34 ADR
sweep, which rejected everything except one narrow correction. The skill codifies
this bar so the tracker does not fill with project-flavored noise.

Source: maintainer direction while auditing a consumer project (sesame).

## 2026-06-26: backlog-autopilot auto-merge method configurable, default merge commit

Context: the risk-gated `--auto-merge` path hardcoded `gh pr merge --auto
--squash` (issue #31). A squash collapses an integration PR that bundles N
tickets — each with its own `test:`/`fix:` commits and "why" bodies — into a
single commit, against `commit-discipline`'s "the git log is documentation", and
it silently overrides a downstream repo whose convention is merge commits.

Decision: make the strategy a validated enum, `--auto-merge-method=merge|squash|
rebase` (env `AUTO_MERGE_METHOD`, file `autoMergeMethod`, same flags > env > file
> default precedence as the rest of `BacklogConfig`), **default `merge`**.
`mergeArgs(branch, method)` builds `--<method>`; an unrecognized value narrows to
undefined and falls through to the next source, so a typo never silently arms an
unexpected strategy.

Alternatives rejected:
- **Minimal: hardcode `--merge`.** Fixes the per-ticket-history loss but still
  imposes one strategy on every consumer; a repo standardized on squash would be
  forced off-convention, the symmetric version of the bug being fixed.
- **Auto-detect the repo's allowed/conventional method.** Requires a `gh`/API
  probe of branch settings at plan time (I/O in the pure config layer) for a
  guess that can still be wrong; an explicit flag with a safe default is simpler
  and deterministic. Deferred as YAGNI until a consumer asks.

Context: `autonomous-backlog-loop` covers the sequential walk-away case; it does
not cover "drain a few independent tickets in parallel, attended, without
breaking anything". Spec/plan:
`docs/specs/2026-06-18-backlog-batch-parallel.md`,
`plans/2026-06-18-backlog-batch-parallel-plan.md`.

Decision: ship a **sister** skill `backlog-batch` (not a mode of the loop). A
two-layer design: an **in-session launcher** selects an independent eligible
batch (Linear MCP), estimates each ticket's file footprint (a lightweight
estimator subagent), partitions **parallel (low overlap) vs sequential (overlap
/ lockfile / migrations)**, and — after **human confirmation** — invokes a
deterministic **Workflow** that fans out one **worktree-isolated subagent** per
ticket, then a **reconciliation subagent** merges the green branches into **one
integration PR gated by the full suite**. The deterministic core (selection,
partition, plan) lives in the CLI (`void-harness backlog-batch plan`,
vitest-tested); the MCP gathering, estimation, and fan-out are in-session /
Workflow. Subagents inherit the parent auth → subscription billing.

Alternatives rejected:
- **A mode of `autonomous-backlog-loop`.** Different orchestration (Workflow
  subagent vs CLI process), risk model (parallel vs sequential), and output
  (integration PR vs PR/ticket). Sister skill keeps each single-subject
  (anti-bloat rule 2); shared selection/worker vocabulary, < 30 % overlap.
- **An LLM session as orchestrator.** A long parent that fans out + reconciles
  accumulates context (rot) and drives the loop non-deterministically. The
  Workflow tool gives deterministic JS orchestration of subagents.
- **Process-parallelism (`claude -p` in worktrees) instead of subagents.** Loses
  tool/MCP inheritance, native observability, and inherited subscription billing
  — the reasons to prefer subagents for an *attended* burst.
- **Blind parallelism / clever overlap graph-coloring.** Naive parallel corrupts
  one shared tree; graph-coloring is YAGNI. Conservative "parallel only if
  isolated", with the reconciliation subagent + full suite as backstop.
- **Live multi-agent smoke on void-harness.** Worktree isolation targets the
  current repo, so a real run here would create worktrees/an integration branch/a
  PR on the harness itself. The live smoke is a consumer-project dogfood; the
  deterministic CLI layers carry the unit-tested confidence.

## 2026-06-26: graph-studio consumes the kernel via a static prebuild, not a runtime import

**Decision:** `apps/graph-studio` does not import `@voidcorp/harness-graph` into
the browser bundle. A Node prebuild (`scripts/prepare-data.ts`, run by tsx) reads
`model.json` + `.void/usage.log`, runs the kernel's `analyze()`, and writes four
static JSON blobs the browser renders.

**Why:** keeps `node:fs` (the kernel's `derive/` adapter) out of the bundle, keeps
analysis single-sourced in the kernel (no duplicated detector logic), and requires
zero edits to the already-merged kernel package (no browser-safe subpath export).
The cost -- findings are computed at build time, not live -- is acceptable for the
P1 static maintainer view; the live consumer surface is P2.

**Alternative rejected:** a browser-safe `@voidcorp/harness-graph/analyze` subpath
export imported at runtime. Cleaner data freshness, but edits a merged package and
risks bundling the fs adapter.

## 2026-06-26: prior art reviewed: patoles/agent-flow (mined for P2, not P1)

**Decision:** agent-flow (live runtime agent visualizer, React/Next + 2D canvas +
SSE hook server) was reviewed. Borrowed for Plan B: its render decomposition into
small focused draw-modules and isolated camera/interaction/particles concerns.
Deferred to P2 as reference: its JSONL event schema (parentId/runtime/sessionId ->
our `activations.jsonl`), its HTTP-hook -> SSE transport (-> `graph live`), and its
timeline/scrubber (-> replay). Its 2D-canvas/React stack and run-physics data model
were not adopted (we are locked on 3D / 3d-force-graph and a structural model).

## 2026-06-18: backlog-loop worker reaches Linear via project .mcp.json only

Context: the loop's worker prompt (Step 1) tells each `claude -p` session to use
the Linear MCP to pick a ticket, but the generated `--settings` allowlist
(`AUTONOMOUS_SETTINGS.permissions.allow`) granted no `mcp__*` tool at all. Since
`--permission-mode acceptEdits` auto-approves only file edits and common
filesystem Bash (not MCP), every pick phase was denied unattended (headless
cannot prompt), so the loop could never select a ticket. The only Linear server
present was the developer's interactive claude.ai connector, which a headless
worker cannot authenticate against.

Decision: the worker reaches Linear exclusively through a project-level
`.mcp.json` server keyed `linear`, token-authenticated from the environment.
Three coupled changes:
- `AUTONOMOUS_SETTINGS.permissions.allow` gains exactly `mcp__linear__*` (not
  `mcp__*`): the unattended worker may call the Linear server and nothing else.
- `buildClaudeArgs` passes `--mcp-config <root>/.mcp.json --strict-mcp-config`,
  so the worker sees only the project's declared servers, never the developer's
  interactive connectors (claude.ai, Gmail, Drive, ...). This both fixes the
  observed failure (the worker fixating on the unreachable connector) and
  tightens the unattended-access boundary.
- Preflight fails loud (`hasLinearMcpServer`) when `.mcp.json` lacks a `linear`
  server, rather than spawning a worker that can never pick a ticket.

The loop is thus explicitly coupled to Linear-via-`.mcp.json`; the worker prompt
was already Linear-specific, so the coupling is named rather than hidden. `linear`
is a fixed convention (not configurable) to keep the allowlist a literal and the
surface minimal (Wing Chun economy of means).

Alternatives considered:
- Allow `mcp__*` broadly: one line, but hands an unattended worker every
  connected server (deploys, mailboxes). Rejected — violates deny-by-default.
- Configurable server name (`linearMcpServer` field): more flexible, but adds
  config surface and a derived (non-literal) allow rule for a name that has no
  reason to vary. Rejected as premature.
- Keep relying on the claude.ai connector + add an allow rule for it: the
  connector is absent in headless `claude -p`, so this cannot work regardless.

## 2026-06-18: backlog-loop orchestrator moves from bash to the TS CLI

Context: the `autonomous-backlog-loop` was launched via a hardcoded plugin-cache
path (`bash .../scripts/autonomous-backlog.sh`) with env-var config, and was a
black box — each `claude -p` worker's output went only to a log file, the terminal
showed `[HH:MM:SS] iteration N/M`, and the decisions workers took were never
surfaced at the HITL boundary (PR merge). Spec/plan:
`docs/specs/2026-06-18-backlog-loop-observability.md`,
`plans/2026-06-18-backlog-loop-observability-plan.md`.

Decision: rewrite the orchestrator in TypeScript under
`packages/cli/src/lib/backlog/`, exposed as `void-harness backlog-loop` (flags,
`--dry-run`, `--help`, first-run wizard) and the `/void-backlog-loop` command.
Each worker is spawned with `--output-format stream-json`, parsed into domain
events that drive a live **append-only** flux and a dense final summary
(tickets, decisions/ADRs, PRs to merge, blockers). Token usage is forced onto the
Claude **subscription**: the worker env is stripped of `ANTHROPIC_API_KEY` /
`ANTHROPIC_AUTH_TOKEN`, and a cloud-provider routing var aborts the run unless
`--allow-api` is an explicit opt-in. The worker prompt and the security allowlist
(`AUTONOMOUS_SETTINGS`) are embedded in the CLI so the orchestrator is
self-contained. The bash script, `iteration-prompt.md`, and
`settings.autonomous.json` are deleted (no other user — no compat shim);
`stop-verification-gate.sh` stays as the opt-in Stop hook.

Alternatives rejected:
- **Keep the bash orchestrator, add jq-based stream-json parsing.** Parsing a JSON
  event stream and rendering a live tree + accumulating a summary is beyond
  comfortable bash; the repo is already TS with a render layer. Bash would be
  fragile and untestable.
- **Drive workers via the Agent tool instead of fresh `claude -p` processes.** That
  shares one process and defeats the per-ticket context reset (the core anti-rot
  property). Fresh OS process per ticket is kept.
- **Ship a bash shim that execs the CLI.** No other user exists; a shim is dead
  weight. Removed outright.

## 2026-06-05: fix release-please PR title pattern (first 0.6.1 release recovered by hand)

Context: the first automated release PR (#7) was titled `chore: release main` —
no version. On merge, release-please logged `pullRequestTitlePattern miss the
part of '${version}'` then `untagged, merged release PRs outstanding - aborting`,
so it created no `v0.6.1` tag and would block all future releases. Root cause: a
`component` set without an explicit title pattern produced a versionless title.

Decision: set `"pull-request-title-pattern": "chore: release ${version}"` and drop
the `component` (a single root package does not need one), so release PRs carry the
version and release-please can tag them on merge. Recovered the stuck 0.6.1 by
hand: tagged `v0.6.1` on the release commit, created the GitHub release, and
relabeled PR #7 `autorelease: tagged` so release-please stops aborting. This commit
is `ci:` so it does not itself trigger a new release.

Alternatives rejected:
- Squash-merge release PRs to force a conventional title: the title-pattern fix is
  the actual cause; merge method is orthogonal.

## 2026-06-04: check points to `void-harness update`, not `/plugin marketplace update`

Context: field usage — `void-harness check`/`doctor` measure drift between the
`.void/config.json` pins and the marketplace HEAD, but `check`'s suggested remedy
was `/plugin marketplace update` (the Claude Code in-session command). That
command refreshes the loaded plugin but does NOT rewrite `.void/config.json`, so
`check` kept reporting drift even right after the user did exactly what it said.

Decision: `check` now points to `void-harness update`, which is the single
gesture that resolves the measured drift — it fast-forwards the marketplace cache
AND bumps the `.void/config.json` pins, then tells the user to restart Claude
Code. (`update` already did both; only `check`'s advice was wrong.)

Alternatives rejected:
- Make `check` itself bump the pins: a read-only "check" should not mutate; the
  mutation belongs in `update`.

## 2026-06-04: automate releases (release-please) + a lockstep version guard

Context: the 0.6.0 bump was manual (`pnpm bump` + asking). Hand-bumping a version
is a process smell and an obvious drift source — exactly the rules-rot pattern
this repo keeps eliminating.

Decision: adopt **release-please**, driven by the Conventional Commits the repo
already enforces. A workflow maintains a single release PR that bumps the
canonical version across every manifest (via `extra-files` — the same file list
as `bump-version.mjs`, plus the core-assets mirror) and writes CHANGELOG.md;
merging the release PR tags `vX.Y.Z` and cuts a GitHub release. The version is
computed automatically; the merge is the only human gate (HITL preserved). Pre-1.0
policy: feat → minor, fix → patch, breaking → minor (`bump-minor-pre-major`). npm
publish is deliberately not wired yet (the package is unpublished).

Added a belt-and-suspenders **lockstep guard** (`scripts/check-version-lockstep.mjs`,
`pnpm version:check`, wired into CI): it fails the build if any version-carrying
file diverges from the canonical marketplace version — so a miss by release-please
(e.g. a bad jsonpath), the manual bumper, or a hand-edit is caught before it ships.
`bump-version.mjs` stays as the manual/offline fallback.

Alternatives rejected:
- **changesets**: per-package independent versions + per-package changelogs
  contradict the single-number lockstep; release-please fits Conventional Commits
  and lockstep better. (Same reason it was dropped in 0.5.4.)
- **Auto-tag/commit on every merge to main**: needs a privileged token to push to
  protected main and bot-commits per merge; the release-PR model is cleaner and
  keeps the human gate.
- **Bespoke release workflow around `bump-version.mjs`**: reimplements the
  release-PR + tag orchestration release-please already does robustly. Kept the
  script only as a fallback; the guard makes either path safe.

Caveat: the release workflow itself can only be validated on its first real run
(GitHub Actions). The load-bearing pieces are tested/guarded: the lockstep check
(unit-tested) and the bumper.

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

## 2026-06-04: review fixes round 2 — $HOME rm/chmod, add/remove parity, doc honesty

Context: a second self-review found more real defects.

Decisions:
- **block-dangerous-bash** missed home-rooted targets. Factored shared target
  patterns: HOME_ROOT `(/ ~ $HOME ${HOME})` each with an optional trailing `/`
  and/or `*`, so `$HOME/`, `${HOME}/`, `~/*`, `$HOME/*` and the chmod/chown
  equivalents now block, while `$HOME/projects`, `~/.cache/x`, `/tmp/x`, `build/*`
  still pass. Tests added for each; the chmod check now requires a recursive flag
  AND a home/root target.
- **add / remove** patched only CLAUDE.md, leaving AGENTS.md stale and breaking
  the sister-doc parity rule. Both now call patchAgentsMd too. Regression test
  added (`test/cli/add-remove-parity.test.ts`).
- **ARCHITECTURE.md** overclaimed that `init` wires the sync pre-commit hook into
  consumer projects (it does not). Reworded: the parity gate is a harness-repo
  concern (`.githooks/` + CI); `init`/`add`/`remove` keep the two consumer docs in
  parity, and a consumer opts into the hook by pointing `core.hooksPath` at the
  shipped `.githooks/`.
- **capture-rule** shipped without an audit note (violating "one audit note per
  skill"); backfilled `plans/skill-audits/capture-rule.md` and added its
  decision-matrix row.

Known debt (NOT fixed this round, tracked): 27 pack skills lack a co-located
`.source` file. Their sourcing is recorded in their `plans/skill-audits/*.md`
notes. Resolution pending a deliberate choice: backfill each `.source` from its
audit note, or amend the sourcing rule to make `.source` mandatory for core
skills + agents and satisfied-by-audit-note for pack skills. Not auto-generated to
avoid fabricated attributions.

## 2026-06-04: review fixes — Codex shell gating, rm variants, anti-bloat scope, agent .source

Context: a self-review found real defects in the round-2 work.

Decisions:
- **block-dangerous-bash** now gates Codex's `shell` tool (was `Bash`-only, so the
  Codex hooks.json routing was inert) and reads an argv-array command. Its rm
  detection was rewritten to a (recursive-flag AND catastrophic-target) pair on a
  quote-stripped command, covering `rm -rf -- /`, `rm -rf "$HOME"`, `${HOME}`,
  `.`, `./`, `./*`, `*`, `~`/`~/` — while still allowing `./dist`, `build/*`,
  `~/.cache/x`, `/tmp/x`. Tests added for each.
- **anti-bloat-check** now scans pack skills/hooks too (was core-only), matching
  what ARCHITECTURE.md already claimed ("any SKILL.md / any hooks/*.sh"). This
  immediately caught 8 pack skill descriptions over the 200-char cap; trimmed.
- **Sourcing discipline applies to agents, not just skills.** doctrine-critic
  already carried a `.source`; the four new agents now do too. The CLAUDE.md
  sourcing rule is read as covering any authored doctrine artifact (skill or
  agent), since both are distilled from external sources.
- Refreshed the marketplace manifest (`.claude-plugin/marketplace.json`): the
  `harness` plugin now lists the five agents + lifecycle hooks; harness-monorepo drops
  the "ADR workflow" line (adr-workflow was promoted to core).

Alternatives rejected:
- A full shell-AST parse for rm safety: too heavy for a <100-line hook. The
  quote-strip + anchored-target regex covers the catastrophic forms deterministically;
  the override env var handles the rare legitimate case.

## 2026-06-04: CLAUDE.md <-> AGENTS.md parity gate made real (was documented fiction)

Context: CLAUDE.md, AGENTS.md, ARCHITECTURE.md and the design plan all cited
`scripts/sync-agent-docs.sh` as a live pre-commit gate enforcing sister-doc
parity. The file did not exist, and there was no git-hook tooling at all
(no husky/lefthook/prepare). The parity claim was unenforced.

Decision: write `scripts/sync-agent-docs.sh` with two modes — `--staged`
(pre-commit XOR: a change touching one sister doc must touch the other) and the
default structure mode (section-heading parity after normalizing the known
terminology variants, stateless so it runs in CI). Wire it via `.githooks/pre-commit`
(opt-in `git config core.hooksPath .githooks`) and a CI step (`pnpm sync:docs`).
Tested in `test/sync-agent-docs/`.

Alternatives rejected:
- A full semantic doctrine-diff: the routing tables legitimately differ in
  content (not just terminology), so a content diff would false-positive.
  Heading parity + the both-or-neither rule is what the headers actually promise.
- Deleting the claim from the docs instead of implementing it: cheaper, but the
  parity rule is worth keeping; make it true rather than drop it.

## 2026-06-04: Codex parity — real doctrine + safety floor, honest about what is pending

Context: the doctrine layer (AGENTS.md) was a real mirror, but the mechanical
layer was Claude-only: `init` never emitted AGENTS.md, and the hooks were Claude
PreToolUse format. A consumer running `init` got a Claude-only harness.

Decision: (1) `init` now patches both CLAUDE.md and AGENTS.md from one runtime-aware
`harnessBlock` (Claude uses `@imports`, Codex lists files to read — Codex has no
`@import`). (2) `protect-sensitive-files` is runtime-aware: it reads
`.tool_input.file_path` (Claude) and scans `apply_patch` envelope headers (Codex),
unit-tested. (3) Ship `packages/core/codex/hooks.json` + `docs/CODEX.md` documenting
the opt-in Codex wiring; `block-dangerous-bash` matches Codex's `shell` tool 1:1.

Honest status logged in docs/CODEX.md: verified = sync gate, AGENTS.md emission,
hook payload parsing. Pending a real-Codex run = end-to-end `.codex/hooks.json`
firing, and a `RUNTIME=codex` (`codex exec`) backend for autonomous-backlog-loop.

Alternatives rejected:
- Auto-write `.codex/hooks.json` + copy hook scripts into every consumer now:
  duplicates the marketplace delivery model and the firing path is unverified
  without a real Codex run. Ship the template + doc; wire deliberately.

## 2026-06-04: lifecycle hooks beyond PreToolUse + plugin slash commands

Context: the plugin wired only PreToolUse hooks and shipped zero slash commands,
leaving the rest of the lifecycle (and in-session ergonomics) unused.

Decision: add `auto-format` (PostToolUse, non-blocking Biome format — repairs
instead of refusing, fails open if Biome absent), `precompact-doctrine`
(PreCompact — re-injects the non-negotiable floor before context loss),
`sessionstart-context` (SessionStart — per-session floor reminder + version), and
`skill-usage-meter` (PreToolUse on Skill — appends to `.void/usage.log` so the
outbound `audit` has real data). Ship `/void-feedback`, `/void-doctor`,
`/void-audit` slash commands so the self-evolution loop is invocable in-session.

Alternatives rejected:
- A UserPromptSubmit hook: overlaps skill auto-discovery and risks noise.
- Making auto-format blocking: formatting must never block a turn; PostToolUse
  non-blocking is the right shape.

## 2026-06-04: claude-md-authoring skill, four scoped agents, no-ai-design-slop, doctrine edits

Context: a deeper pass over the best-practice corpus surfaced gaps not covered by
the existing skills/agents.

Decision: add the `claude-md-authoring` skill (the harness produces CLAUDE.md
files; this governs writing them: length budget, no style rules -> linters,
`file:line` over snippets, progressive disclosure). Add four read-only,
model-tiered, narrow-scope agents — `silent-failure-hunter` (sonnet),
`type-design-analyzer` (opus), `code-explorer` (sonnet), `migration-planner`
(opus) — each routing out of scope, none overlapping doctrine-critic or gstack.
Add the `no-ai-design-slop` PreToolUse hook (deterministic regex for AI visual
tells; static gate, complements frontend-design without touching /design-review).
Distil doctrine into existing skills: vertical-slice planning (writing-plans),
frequent-intentional-compaction + leverage hierarchy (context-management,
code-review), and the agent model-tier convention (ARCHITECTURE.md).

Alternatives rejected:
- Stack-specific reviewer agents (per ECC/wshobson): those are pack concerns, not
  core; rejected to hold the anti-bloat line.
- Cryptographic review-surface receipts (wshobson governance): over-engineered;
  the HITL gate is the load-bearing part, not signed receipts.

## 2026-06-04: opt-in autonomous-backlog-loop (Ralph distilled, HITL at the boundaries)

Context: the harness wanted a way to drain a curated Linear backlog unattended,
with full craftsman discipline, without adopting the unsupervised Ralph loop
(`while :; do cat PROMPT | claude --dangerously-skip-permissions; done`) which is
the antithesis of the harness's HITL-absolute principle.

Decision: ship `autonomous-backlog-loop` as an explicitly-launched skill (core,
never a default). One FRESH `claude -p` process per ticket (true context reset),
state in Linear + on-disk plan files. The human gates move to the boundaries —
backlog curation (acceptance criteria = approved spec) and PR merge — instead of a
per-action prompt. Default `AUTO_MERGE=0` (PRs, human merges). Full-auto
(`--dangerously-skip-permissions`) is gated behind `UNSAFE_FULL_AUTO=1` + a required
`VOID_SANDBOX` marker. The security hooks stay live; the orchestrator refuses to
start with `VOID_HARNESS_ALLOW_*` set or on a dirty tree.

Alternatives rejected:
- Unsupervised Ralph loop as default: no review, no floor, no sandbox. Rejected;
  offered only as an explicit sandboxed opt-in.
- Auto-merge by default: review is where correctness is owned. Default to PRs.
- Self-judged completion: the test suite is the gate, not the model's self-report.
- A `/clear`-only loop (single long session): context rot degrades quality silently;
  a fresh process per ticket is the stronger anti-context-rot.

## 2026-06-04: two security hooks shipped default-on (protect-sensitive-files, block-dangerous-bash)

Context: the harness shipped quality hooks but no safety floor for destructive
actions, and nothing protecting secrets/lockfiles from accidental edits. This is
the prerequisite for any unattended run and a general improvement.

Decision: add `protect-sensitive-files` (PreToolUse Edit|Write — blocks `.env*`
secrets, private keys, credential files, lockfiles, `.git/` internals) and
`block-dangerous-bash` (PreToolUse Bash — blocks recursive root delete, fork bomb,
raw-device writes, force-push without `--force-with-lease`, destructive SQL). Each
has a single deliberate-override env var (`VOID_HARNESS_ALLOW_SECRET_EDIT`,
`VOID_HARNESS_ALLOW_DANGEROUS`) so legitimate cases are unblocked explicitly while
the default is safe. Wired into the core plugin PreToolUse (now 10 hooks).

Alternatives rejected:
- Warning-only (non-blocking): a destructive command warned-but-allowed is not a
  floor. These are irreversible; they block.
- No override: would force users to disable the hook entirely for a one-off
  legitimate edit. A scoped env override is safer than an all-or-nothing toggle.

## 2026-06-04: adr-workflow promoted from pack-monorepo to core

Context: `adr-workflow` lived in pack-monorepo, but ADRs are a universal craftsman
concern and the repo meta-rule already mandates logging non-obvious decisions.

Decision: move the skill to `packages/core/skills/adr-workflow`, generalize the
"monorepo" wording to "codebase", add the missing `.source`, and drop "ADR workflow"
from the pack-monorepo manifest description. Audit note updated (pack → core).

Alternatives rejected:
- Leave it in pack-monorepo: consumers without the monorepo pack would lack a
  universal discipline the meta-rules assume exists.

## 2026-06-04: skill name == folder + naming gate added to anti-bloat-check

Context: the Agent Skills spec requires `name` to equal the parent directory and to
match `^[a-z0-9]+(-[a-z0-9]+)*$`; a mismatch breaks auto-discovery silently. The
harness promised "skill tests pass in CI" but had no structural validation.

Decision: extend `scripts/anti-bloat-check.sh` (the single source of truth, already
run in CI) with a name==folder + naming-convention check across core and pack
skills. Cheap, deterministic, closes the structural half of the CI promise.

Alternatives rejected:
- A separate `skills-ref validate` dependency: adds an external tool for a check
  that is a few lines of shell. Kept it inline in the existing script.

## 2026-06-04: four new core skills + the Rationalizations/Verification section standard

Context: research across anthropics/skills, the Claude Code creators' interviews, and
the best-practice corpus surfaced gaps not yet covered by the 22 core skills.

Decision: add `source-driven-development` (read official docs for the installed
version before writing config; cite the source), `context-management` (the window is
the core constraint: clear, compact, two-correction reset, fresh-context subagents,
state on disk), `compounding` (end-of-cycle ritual: name the reusable pattern and
route it via capture-rule / harness-evolution), and `api-and-interface-design`
(contract-first public interfaces, minimal surface, versioning). New skills adopt a
`## Rationalizations` table (pre-empts the model's excuses to skip the skill) and a
`## Verification` proof-gate as the standard anatomy.

Alternatives rejected:
- Retrofit the Rationalizations/Verification sections into all 22 existing skills
  now: large diff, rewrites authored voice broadly. Set the standard in new skills;
  backfill opportunistically.
- A full `writing-skills`/skill-creator port (to replace the superpowers pointer):
  high value but a larger effort; deferred as a tracked follow-up.

## 2026-06-01: no-null-grep matches on a comment/string-stripped view (heuristic, not AST)

Context: field feedback from a consumer monorepo — `no-null-grep.sh` blocked a
commit because a comment literally said "pas null". The hook matched `\bnull\b`
against the raw line, so the substring `null` inside a `//` comment, a `/* */`
block, or a quoted string was flagged as the `null` literal.

Decision: before matching, strip string literals (`"…"`, `'…'`, single-line
`` `…` ``), inline `/* */` blocks, and `//` line comments per line via sed, then
match `\bnull\b` on the residue. The `// allow-null:` override is checked on the
RAW line first (stripping would erase the tag). Tests in
`test/no-null-grep/no-null-grep.test.ts`.

Alternatives rejected:
- A real AST/TS-aware parse: correct but turns a 56-line shell PreToolUse hook
  into a tsc/tree-sitter dependency, violating "hooks ≤ 100 lines, no framework".
- Comment-stripping only (the minimum the reporter suggested): leaves string
  literals like `"value is null"` flagged. Strings are a legitimate source of the
  same false positive, so they are stripped too.

Known limit (documented in the hook): line-oriented, so a `null` inside a
multi-line block comment or template literal split across the edit chunk may
still be reported. The `// allow-null: <reason>` tag is the escape hatch.

## 2026-06-01: test key/token fixtures are generated at runtime, gitleaks stays as-is

Context: same field feedback. The repo's gitleaks `generic-api-key` rule (NOT a
void-harness hook) flagged a hardcoded base64 `encryptionKey` test fixture and
blocked the commit — gitleaks decodes base64 and scores its entropy.

Decision: do NOT add a `*.test.ts` allowlist to `.gitleaks.toml`. A blanket
path allowlist is a security hole (real leaked secrets in a test file would pass
unscanned). The convention instead: test fixtures for keys/tokens are generated
at runtime (`crypto.randomBytes`) or use low-entropy placeholders — never a
hardcoded high-entropy base64 literal. This keeps the scan at full strength and
removes the false positive at the source.

Scope note: this is a convention for harness-consuming projects, not a code
change in this repo. Logged here because it is a deliberate "don't weaken the
gate" decision with a credible (and rejected) alternative.

## 2026-06-01: one `doctrine-critic` agent, not the three originally planned

Context: the design doc Section 8 and DEV-363 planned three review agents
(`senior-reviewer`, `security-reviewer`, `architect-critic`). An agent-layer
audit (DEV-363, pre-implementation) measured each against what the harness and
the global layer already ship and found heavy responsibility overlap, in tension
with anti-bloat rules 3 (overlap > 30 %) and 6 (no spillover into gstack):

- `senior-reviewer` ≈ global `pr-reviewer` agent + `tdd-guardian` + `ts-enforcer`,
  gstack `/review`, built-in `/code-review` (incl. `ultra`), harness `code-review`
  skill. ~75 % overlap.
- `security-reviewer` ≈ gstack `/cso` (OWASP/STRIDE/secrets/supply-chain, the exact
  scope), built-in `/security-review`, harness `security-guidance` skill (which
  already delegates to `/cso`). ~85 % overlap.
- `architect-critic` ≈ gstack `/plan-eng-review`, harness `hexagonal-architecture` +
  `domain-driven-design` skills + pack `dependency-direction`, and the deterministic
  `boundary-direction-check.sh` hook. ~70 % overlap.

The principle: an agent only earns its place when it adds something a skill or a
hook cannot. The one gap nothing else fills is a **context-isolated, read-only
judgment of conformance to VoidCorp doctrine**. The 8 PreToolUse hooks enforce the
*mechanical* floor (no-any, boundary direction, …) at Edit/Write time; generic
reviewers (`pr-reviewer`, `/review`) check generic quality. Neither judges the
*non-mechanical* doctrine calls — over-abstraction, tests that assert nothing, the
strict-TDD Iron Law and its `.void/config` modes, a boundary respected by the
letter but not the spirit, the seven anti-bloat rules on skills/hooks themselves.

Decision: ship a single `doctrine-critic` agent (read-only, isolated context). It
judges doctrine conformance and **routes** rather than re-implements: it flags
trust-boundary code and hands off to `/cso`, and hands line-level bug hunting to
`/code-review`. Spec: `plans/2026-06-01-doctrine-critic-agent.md`. DEV-363 is
rescoped 3 → 1; the `security-reviewer` and `architect-critic` slots are dropped
(their value already lives in `/cso`, the boundary hook, and the hexagonal/DDD
skills). Manifests move from "3 agents on the roadmap" to "1 shipped".

Naming: "critic", not "reviewer", to avoid routing ambiguity with `pr-reviewer`,
gstack `/review`, and built-in `/code-review` — three review tools already in a
consumer session. "doctrine", not "harness" (which reads as the install itself,
colliding with `doctor`/`audit`) and not "craftsman"/"conformance" (vaguer / more
process-flavoured). It inherits the "critic" of the dropped `architect-critic`.

Alternatives rejected:
- Build all three as planned: triples the maintenance surface and injects
  routing non-determinism (three thin wrappers competing with the global agents
  already present) for near-zero marginal value. Disqualifying for a harness whose
  edge is determinism.
- Ship zero agents (purist anti-bloat): defensible, but leaves the doctrine
  judgment layer uncovered — the hooks catch only the mechanical violations.

## 2026-06-01: keep `workspace:^` for internal deps, guard the packed tarball in CI

Context: `pack-nextjs` peer-depends on `pack-monorepo`. The risk flagged by audit:
`npm pack`/`npm publish` do not understand the workspace protocol, so `workspace:^`
would leak verbatim into a tarball published with npm.

Attempt rejected: switch to an explicit `^<version>` range so the source is
npm-safe. Verified empirically that this BREAKS: `pack-monorepo` is not published
to npm, and pnpm 9 defaults to `link-workspace-packages=false`, so a plain range
resolves against the registry and `pnpm install --frozen-lockfile` fails with
`ERR_PNPM_OUTDATED_LOCKFILE` / unresolved package. The workspace: protocol is
therefore REQUIRED for unpublished internal deps; the earlier "use a literal
range" idea (and a bump-version range-rewriter) was reverted.

Decision: keep `workspace:^` in source. pnpm pack/publish rewrites it to
`^<version>` (verified: the packed tarball carries `^0.5.4`). A CI + release gate
(`scripts/check-publish-safety.mjs`) packs each npm package with pnpm and fails
if a `workspace:` specifier survives into the tarball. This verifies the artifact
we actually ship and catches a conversion regression (bad `.npmrc`, pnpm change).
It does NOT, and cannot, stop a manual `npm publish` that bypasses our tooling:
RELEASING.md mandates `pnpm -r publish`, and that process rule is the boundary of
what an in-repo check can enforce.

## 2026-06-01: .void/config.json pins marketplace plugins, not npm packages

Context: the `packs` field in `.void/config.json` is written by `init` as
`@voidcorp/<plugin-name>` (e.g. `@voidcorp/harness-nextjs`) and read back by
`doctor` in the same shape. The docs example instead showed `@voidcorp/pack-nextjs`
(the npm package name), mixing two vocabularies for the same field.

Decision: the field pins marketplace plugins (what `doctor` compares against the
marketplace HEAD), keyed `@voidcorp/<plugin-name>`. Docs were aligned to the
runtime; the schema was left unchanged to avoid breaking existing consumer
configs. The npm package names (`@voidcorp/pack-<stack>`) are a separate concern
(runtime `import`s), documented as such.

Alternative rejected: rekey the field to npm package names. That would require
changing init + doctor in lockstep and would break any `.void/config.json`
already written in consumer projects, for no functional gain (doctor needs the
plugin identity, not the npm name).

## 2026-06-01: em dash / emoji rule softened (no purge, no gate)

Context: the hard rule "No em dashes, no emojis in code/docs/commits" was
contradicted by the corpus itself: 254 tracked files contain em dashes, mostly
deliberate typographic separators in skill prose, and the render layer uses an
em dash glyph as data. CLAUDE.md and AGENTS.md violated their own rule.

Decision: soften the rule to target intent (no AI-slop filler) while allowing
em dashes and emojis where they carry meaning. No repo-wide purge, no CI gate.

Alternatives rejected:
- Purge all 254 files and add a global grep gate: enormous diff, rewrites the
  authored style of every skill, and would still need an allowlist for the
  render glyph. Cost far exceeds the benefit.
- Drop the rule entirely: loses the original intent (keeping AI-slop out of
  newly written prose and commits).

## 2026-06-01: Biome as the linter (over ESLint)

Context: the root `lint` script fanned out to per-package `lint` scripts that
did not exist, so `pnpm lint` printed "None of the selected packages has a lint
script" and exited 0. A quality harness shipped with a gate that gated nothing.

Decision: adopt Biome (`@biomejs/biome`) as the single linter. Root `lint`
script is `biome lint`; config lives in `biome.json`, scoped to first-party
TypeScript (`packages/**/src`, config files, `test/`) and excluding `dist`,
`node_modules`, `templates`, and `*.d.ts`. A CI step runs `pnpm lint`.

Alternatives considered:
- ESLint + typescript-eslint: more rules and plugins, but heavier install,
  slower, and needs a flat-config plus parser wiring. Overkill for a small CLI.
- Keep the fan-out and add per-package ESLint: more moving parts, same result.

Why Biome won: single binary, near-zero config, fast, and the hooks already
treat both `biome` and `eslint.config` as known toolchain markers. The formatter
is left disabled in the gate (`biome lint`, not `biome check`) so the gate
enforces correctness without forcing a repo-wide reformat.

## 2026-06-01: jq is a hard runtime dependency, surfaced by doctor

Context: 15 of the 20 hooks parse the Claude Code tool-call JSON from stdin with
jq. On a machine without jq the hooks fail open and silently stop enforcing.

Decision: `void-harness doctor` now checks for jq alongside gh, with an install
hint. jq stays an external dependency (not bundled): it is ubiquitous and
bundling a binary per platform is not worth the weight.

## 2026-06-19: the autonomous loop's push boundary is server-side, not a hook (issue #17 cluster A)

Context: the autonomous backlog-loop (`autonomous-backlog-loop`) let each worker
push its branch and open its PR, with a planned `git push` PreToolUse hook as the
guard against a push to a protected branch. The autoplan (3 Claude voices + Codex
gpt-5.5 xhigh) found the guard is at the wrong layer: the worker also holds
`Bash(node:*)`/`Bash(npm:*)`/`Bash(npx:*)`, so `node -e "execSync('git push
origin HEAD:main')"` makes PreToolUse see `node`, not `git push` — a
string-matching hook guarding an agent with arbitrary code execution is
bypassable by construction.

Decision: move the boundary off the hook.
- **Server-side branch protection** on the base (`main`/`master`) is the durable
  boundary — the remote refuses a non-PR push regardless of what the worker runs.
  The orchestrator probes it at preflight (`gh api .../branches/<base>/protection`)
  and hard-refuses a confirmed-unprotected base.
- **The worker is commit-only.** `git push` and `gh pr` are removed from its
  allowlist; the trusted orchestrator pushes (explicit refspec, no force) and
  opens the PR. The capability is removed, not gated.
- **Per-ticket worktree isolation** so a worker's branch never moves the main
  HEAD; run-scoped, pruned at start, removed in a finally.
- `block-protected-push` stays as a **secondary net**, not the boundary.
- A4: the git allowlist is trimmed to the non-destructive subset (`cherry-pick`,
  `rebase --onto`); `git apply` was dropped (arbitrary write past the Edit/Write
  protect-sensitive-files gate). Command-execution rebase flags (`--exec`,
  `--rebase-merges`, `--strategy-option`, `--unsafe-paths`) are blocked in
  `block-dangerous-bash`, because Claude permission patterns are prefix-only and
  cannot catch a mid-command flag.
- A3: `source-driven-development` gains an offline branch (inject the doc as a
  port, validate with Zod) and a blocking `source-debt` (label + PR checkbox);
  the loop withholds auto-merge while a source-debt is open. Egress stays at zero.

Alternatives considered:
- Keep enforcement in the hook (original plan): rejected — bypassable by code
  execution, as above. The hook is demoted to a secondary net.
- Give the orchestrator a Linear GraphQL client so it (not the worker) moves the
  ticket: rejected as bloat — Linear is not the protected boundary; the git remote
  is. The worker keeps its scoped Linear MCP access; the orchestrator owns only
  the remote write (push + PR).

Framing: these changes reduce *false blocks* (the worker no longer trips a guard
mid-task), not the *blast radius*. Rollback tripwire: another direct-push-to-base
incident → unattended mode requires `VOID_SANDBOX` until the gap is closed.

Known pre-existing gap (logged separately, not closed here): `cat > .env` and
`node -e "fs.writeFileSync('.env', ...)"` bypass `protect-sensitive-files`, which
is wired to `Edit|Write` only, not `Bash`. Tracked in
`.void/harness-feedback/proposed/`.

## 2026-06-19: implement the promised `audit` + `feedback push` CLI commands (issue #17 cluster C)

Context: `harness-evolution`'s SKILL.md and PHILOSOPHY.md presented
`void-harness audit` and `void-harness feedback push` as if they existed, and
two shipped slash-commands depended on them — `/void-audit` literally runs
`void-harness audit`, and `/void-feedback` defers promotion to
`void-harness feedback push`. Neither CLI command existed, so `/void-audit` was
broken on invocation and the inbound→issue loop had no automation. (Issue #17
cluster C / C1.)

Decision: implement both, rather than rewrite the skills to a manual gesture.
- `void-harness audit` (MVP, usage-log only): reads `.void/usage.log` (written by
  the `skill-usage-meter` hook, `<timestamp>\t<skill>` per line) and classifies
  each harness skill as active / stale (`--stale-days`, default 30) / never. The
  stale + never lists are the deprecation candidates. Report-only (HITL).
- `void-harness feedback push`: reads `.void/harness-feedback/proposed/*.md`,
  previews by default (no side effects), and with `--open` files each note as a
  GitHub issue on `voidcorp-core/void-harness` (label `harness-feedback`) and
  moves it to `pushed/`. Preview-by-default keeps promotion deliberate.

Why implement, not doc-fix: the skills already wrap these commands by design
(the skill is the interactive HITL surface; the CLI is the deterministic,
testable engine). Implementing makes the skills work and the docs true; a
doc-fix would have left `/void-audit` a no-op.

Scope held to the usage-log MVP for `audit`: upstream-source deprecation and
decision-matrix-conflict detection need data sources beyond the usage log and
are a documented follow-up — not built here. The pure cores
(`lib/audit.ts`, `lib/feedback.ts`) are unit-tested; the commands are thin
readers/renderers over them.

Alternative considered: a fictional `audit propose-pr <item>` helper (referenced
in an old SKILL line) — dropped. `audit` reports; deprecation PRs stay
hand-authored, consistent with "HITL is absolute, never auto-write doctrine."

## 2026-06-19: issue #17 cluster B resolved as guidance, not harness code

Context: cluster B (B1 fail-soft outbound HTTP, B2 `defineFormAction` drops
multi-value FormData, B3 `server-only` untestable under Vitest) read like code
bugs, but the harness is a meta-repo of skills + CLI + thin pack runtimes — it
has no `defineFormAction` and no Next.js app. The bugs were observed in a
consumer project; the harness's job is to teach the correct pattern so the
consumer's agent does it right.

Decision: fix each as guidance in the skill that owns the subject.
- B1 → a "Fail-soft outbound HTTP" section in core `async-safety` (the mirror of
  its outbox pattern: a degradable read on the request path — timeout + decided
  failure mode).
- B2 → `harness-server:server-action` taught the bug itself
  (`Object.fromEntries(formData)` collapses repeated fields to the last value).
  Fixed there (`getAll` + `z.array`) and cross-referenced from
  `harness-react:form-pattern`'s native-form path.
- B3 → a new `harness-server:testing-server-modules` skill: alias
  `server-only`/`client-only` to an empty stub in the shared Vitest config, with
  the load-bearing caveat that the alias is test-only and must never erode the
  real build-time boundary.

Why guidance over code: there is no harness code to patch; a skill edit is the
durable fix that reaches every consumer. Packaged as one cluster-B PR.

## 2026-06-21: consolidate backlog skills into `backlog-autopilot` (in session)

Context: `backlog-batch` (attended, parallel, independent tickets) and
`autonomous-backlog-loop` (sequential, walk-away, one `claude -p` process per
ticket) overlapped, and neither served the real goal — drain a Linear pool over
hours, in session, grouping tickets into logical clusters, one clean PR per
cluster, optionally auto-merged. The loop's out-of-session `claude -p` lost the
in-session MCP / connector / subscription inheritance.

Decision: consolidate both into one in-session skill, `backlog-autopilot`, and
**delete** `autonomous-backlog-loop` (skill + `/void-backlog-loop` command + the
`claude -p` orchestrator, stream-json parser and embedded worker prompt) with no
deprecated alias. The machine-readable worker-event protocol (`VOID_EVENT`) is
preserved (extracted to `events.ts`) as the future worker-output contract. A
future **headless backend** (walk-away / cron) is reserved and deferred, not the
deleted loop.

- **Orchestrator** — hybrid: a thin in-session LLM launcher pilots the cluster
  queue (durable `.void/autopilot` state + compaction between clusters), and a
  deterministic Workflow fans out disposable worktree subagents per cluster. This
  is "the LLM orchestrator done right": the pilot never reads implementation
  files, so it does not rot over a multi-hour run, while keeping MCP and
  subscription inheritance the out-of-session loop lacked.
- **Mode auto-detection** — given a pool (Linear project / milestone / parent
  graph / label / manual IDs), detect logical clusters (>= 2 linked tickets, with
  a **file-footprint overlap** corroborating the graph edge); otherwise drain a
  **batch of 4** independent tickets. Default batch size aligned to 4.
- **Opus everywhere** — deliberate derogation from `llm-cost-discipline` (Sonnet
  default): the run is subscription-billed, not API-metered, and the top-5 %
  quality bar wants constant judgment. Overridable by flag.

Why: keeps the user-facing capability one skill (anti-bloat rule 3, no residual
overlap), in session (MCP/subscription alive), without the context rot a single
long LLM orchestrator would suffer. See `docs/specs/2026-06-21-backlog-autopilot.md`
and `plans/2026-06-21-backlog-autopilot-plan.md`.

## 2026-06-21: auto-merge is risk-gated and sequential, not a "deterministic conflict-free cascade"

Context: the first design promised auto-merge with a "deterministic conflict-free
cascade" across stacked PRs. An `/autoplan` review (CEO + Eng + DX, dual Claude +
Codex voices) found this infeasible: `gh pr merge --squash` rewrites the parent
SHA, so a child rebased onto it conflicts whenever the parent touched shared
lines; GitHub does not auto-retarget a child unless the base branch is deleted;
and the existing `reconcile` is an LLM subagent, not deterministic.

Decision (binding, supersedes the cascade promise in the original spec):
- **No "guarantee conflict-free".** Stacked merges run **strictly sequentially**:
  wait for the parent to fully merge, rebase the single next child, **human gate
  on conflict** (never silent LLM resolution). A state machine **classifies**
  (conflict / stale / protection / CI / merge-queue) and **blocks safely** with an
  actionable report; tested against an ephemeral git remote, not arg snapshots.
- **Risk-gated auto-merge.** `--auto-merge` to `develop`/`main` arms only for a
  **low-risk** cluster (small diff, non-UI/security/migration, owned paths, not a
  stack root); risky clusters and stack roots get a PR for a human to merge.
- **Unknown branch protection is fatal** under `--auto-merge` (was a warning).
- **Worktree always** — one cluster worktree even for sequential work, per-ticket
  in parallel (crash / dirty-state safety); the earlier "worktree only when
  parallel" regressed safety.
- **Crash-resume reconciles remote state** (`gh pr list`, SHA, base, checks) with
  atomic writes, instead of replaying a local cursor.

Why: branch protection proves the tests passed, not that the change is right; the
review made the auto-merge blast radius explicit and replaced an impossible
mechanism with a safe, testable one. The operator's choices at the review gate:
keep the clean deletion (no alias), reserve a future headless backend, restrict
auto-merge to low-risk clusters, and always use a worktree.

## 2026-06-26: backlog-autopilot `verifyCmd` must mirror CI, not a test + type-check subset (issue #28)

Context: a real batch run drained 4 tickets into one integration PR on a Next.js 16
/ Turborepo / Bun monorepo with `verifyCmd = test + type-check`. The batch went
green, then CI / Vercel surfaced three integration defects the gate could not see:
a `'use client'` barrel dragging a `server-only` service into the client graph
(caught only by `build`), two tickets creating clashing dynamic route slugs at one
path position (production build tolerated it, `next dev` / the Playwright webServer
crashed on boot), and an e2e job that migrated but never seeded the mono-tenant org
(first authed write FK-violated). "The full suite is the judge" ran a strict subset
of CI, so a green batch produced a red CI.

Decision: `verifyCmd` is doctrine-bound to mirror the project's CI gate. For an app
workspace (Next.js especially) that means including `build` and the e2e/integration
suite when one exists, not just unit `test` + `type-check`. The launcher (Layer 1)
defaults `verifyCmd` to the full gate for apps or prompts the human to set it; the
**same** command gates the per-ticket worker and reconciliation (Layer 2), so a
green batch equals a green CI by construction. A credible alternative — keep the
subset default and only warn — was rejected: the divergence is silent and only
surfaces post-merge, which is exactly when it is most expensive.

Why: build- and run-time integration failures (client/server boundaries, route
trees, migrations/seed) are invisible to `test` + `type-check`; aligning the judge
to CI is the cheapest place to catch them. Guidance change only (skill + workflow
prompt text); no new CLI surface.

## 2026-07-01: ship the consumer graph tooling as a committed bundle, gated on the embedded model (sub-project B)

Context: the graph tooling (kernel, `graph` CLI, studio) ran only in the monorepo.
Consumers of the harness get their assets from the marketplace (`voidcorp-core/void-plugins`),
which pins a repo SHA and fetches `packages/core` directly — there is no npm publish
(deliberate) and no out-of-repo asset channel. To let a consumer run `graph cost`/`live`
against their own project, the tooling has to reach them through the plugin assets.

Decision: build one self-contained `packages/core/graph/void-graph.mjs` (esbuild bundles the
kernel + CLI, the model.json is baked via a `__VOID_BUNDLED_MODEL__` define, the single-file
vite studio is inlined via `__VOID_BUNDLED_STUDIO__`) and **commit it** so the marketplace ships
it. On the consumer it runs 100% local (served on `localhost`, offline), filtered to the packs
enabled in `.claude/settings.json`. It is invoked by the `/void-graph` command.

Two credible alternatives were rejected. (1) Publish the CLI to npm — rejected: the zero-npm
policy stands, and it would not reach marketplace-only consumers anyway. (2) Host the studio at a
public URL and ship only a data server — rejected: it adds a network dependency and a
mixed-content (https page → http localhost) problem, breaking the offline guarantee.

The freshness gate is the **embedded model**, not the whole artifact. `graph check-bundle`
compares the sha256 of the model baked into the committed `.mjs` (self-reported by
`graph model-hash`) against the committed `model.json`. Byte-comparing the full vite/esbuild
output was rejected as the gate: its determinism across environments (rollup chunking, bundler
versions) is not guaranteed, so it would flap; the model is the part that actually drifts when
skills/hooks/commands change. The artifact is excluded from the npm CLI's `core-assets` mirror
(consumers get it via the marketplace, not the unpublished tarball) to avoid doubling the blob.

Why: committing a ~1.9MB build artifact into git is a real cost (blob growth per release), taken
knowingly because it is the only path compatible with zero-npm + marketplace-ships-repo. The
cost is bounded by refreshing the artifact only when `model.json` changes (a skill/hook/command
add or remove), enforced by the per-PR `graph:check-bundle` gate — the same "regenerate the
derived asset, fail on drift" pattern the repo already uses for `core-assets` and `model.json`.
