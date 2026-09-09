---
title: Visible native agent supervision
date: 2026-09-05
status: approved
author: Folpe + Codex
ticket:
related:
  - docs/VOID-MACHINE-VISION.md
  - docs/specs/2026-08-31-autonomous-until-develop.md
---

# Outcome

Folpe can identify the coordinator, workers, reviews and blocked work at a glance
while the existing Implement/Autopilot cycle runs. Visibility must not create a
second execution engine or delay DEV-832 reliability work with a platform rewrite.
This approved presentation slice does not change existing mission or merge grants.
For a request to code on project X, resolve X first, then create or reuse a workspace
identified by canonical project path plus mission ID. The coordinator launches in
that project on the left; its native terminal workers appear on the right. Continue
the existing coordinator when it already owns the mission, rather than duplicating it.

## Approaches and recommendation

1. Recommended first slice: native cmux titles and colored status metadata, fed
   from existing mission/runtime observations. Retain native execution and review.
2. Ambitious target (x10): one live mission view across runtimes/projects, linking
   each unit to its native session, exact proof, budget and recovery action. Defer
   until the first slice demonstrates reduced human effort; no new event store.
3. Lateral alternative: a compact read-only terminal board of existing events,
   with links to native sessions, when separate agent panes are unavailable.

## Ownership and display

The runtime adapter owns execution, native delegation, session identity and stop.
The optional presentation adapter owns workspace/surface references, titles and
status display. A terminal surface is not evidence that an agent is alive, and a
runtime subagent need not expose its own PTY. Never launch duplicate workers just
to fill panes. Reuse an existing coordinator session instead of spawning another.

Folpe approved this slice on 2026-09-05 with the following layout: coordinator
on the left (approximately 40% width), up to three worker surfaces stacked vertically
on the right (approximately 60%). Preserve a readable minimum height; additional
activity stays in the overview rather than shrinking panes indefinitely.
One overview and up to three visible worker surfaces where the runtime supports
separate surfaces. Native nested specialists remain allowed within the global
resource budget; read-only reviewers do not each require a worktree. Writers own
separate worktrees; overlapping files and shared Git mutations remain serialized.

Coordinator role: violet label. Worker role: blue label. Review role: cyan label.
State appears independently as text: RUN, REVIEW, WAIT, FAILED, VERIFIED, STOPPED,
UNKNOWN; status colors may reinforce text, never replace it. VERIFIED requires
current canonical evidence. STOPPED is not automatically failure or success.

Two compact display lines where supported:
- ROLE | ticket | runtime/model (observed) | branch prefix truncated with ...
- state | elapsed | remaining ceiling | last event age | latest verification SHA

Branch display uses a fixed width of 24 characters; full branch remains available
in details. Quota/ctx/resource values appear only when measured with provenance;
unavailable values are shown as unknown, never estimated as remaining allowance.
Use colored native status pills as fallback if individual pane colors are absent.

## Source of truth and supervision

Reuse the provider for ticket state and existing mission events for execution
proof. Native session references own continuity. No editable .run/state.md mirror.
A generated view is replaceable and names its source and observation timestamp.
Screen output helps diagnosis, never certifies work. Git alone cannot distinguish
thinking, testing, waiting for permission and a crashed process.

Update on available native events and bounded reconciliation. No full-suite rerun
every 15 minutes. Missing events raise UNKNOWN/stale status; inactivity alone does
not kill or requeue work. Before restarting, reconcile process/session identity,
owned resources and ambiguous effects to avoid concurrent writers or repetition.

Keep existing risk-based model routing, permission gates and proof requirements.
Do not reserve capable models exclusively for the coordinator. Resolve stop
criteria from the ticket/program first; ask only if materially missing. Reserve
shutdown/verification time proportionally to the run, rather than a fixed 15 min.

## Boundaries and failures

A multiplexer offers presentation, not durable process recovery by itself.
Capabilities distinguish input delivery, output reading, event observation,
reattachment and actual restart recovery, with version and observed provenance.
The no-terminal fallback uses the existing runtime process adapter; nohup plus PID
files is not a replacement supervisor. A PID alone is not stable process identity.
Stop requests are reconciled against owned processes, with bounded escalation
only where authorized; sending Ctrl-C alone does not prove termination.

Clean owned temporary resources on success/error/cancel. Retain unfinished work,
native recovery references and necessary proofs; never keep all worktrees forever.
An authorized worktree directory may be outside the checkout. Never modify other
projects or user files. Do not change pushes/PR/merge policy in a display feature.

## Acceptance and delivery

1. A real coordinator and worker are identifiable by role, unit and current state;
   a native reviewer without a PTY is represented honestly in the overview.
2. Observed start, wait, completion and failure update the right identity; stale
   or absent observations are visible and never rendered as verified success.
3. Missing cmux leaves execution intact and uses the native/plain-text fallback.
4. Display shutdown leaves user panes and work intact and no owned observer leaks.
5. A real DEV-832 run supplies display evidence without claiming its unfinished
   consumer journeys have passed.

First implement only cmux presentation through existing native facilities. Validate
actual UI readability manually; use focused behavior tests for any event-to-state
mapping (strict TDD). No screenshot snapshots or tests of hardcoded label prose.
Later add tmux only against a demonstrated consumer requirement and common contract.
Rollback disables the optional presentation integration; execution state is unchanged.

## Sources and self-review

Observed 2026-09-05: installed cmux 0.64.22 (102), local --help, identify and
capabilities (socket protocol v2). Local help exposes rename-tab, read-screen,
set-status --color, workspace-action --color, events and top. Individual pane
background color and native-subagent PTY exposure remain unverified capabilities.
Official reference: https://cmux.com/docs/api (read 2026-09-05). Installed help wins
where the online documentation describes a different version.

Self-review: no new execution registry, no duplicate delegation, no invented
quota/health, no implicit change to merge grants, no inactivity-based destructive
recovery. Scope is one display slice; cross-runtime dashboard remains deferred.
