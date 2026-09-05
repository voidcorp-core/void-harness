# Native mission supervision

Local presentation integration for the approved
[spec](specs/2026-09-05-visible-agent-supervision.md). The executable helper lives
in this harness checkout; it is not yet an npm-installed runtime feature.

## Procedure (independent of the multiplexer)

1. Resolve the target project through the existing project discovery and read its
   rules. Resolve the mission through the provider or the explicit user objective.
   Record Git branch/status; preserve unrelated changes. Reuse native continuity.
2. Call the presentation adapter to ensure a workspace for the canonical project
   path and mission identity. Existing workspace means reuse, not another launch.
   Display mode `text` has no terminal handles and does not block native execution.
3. If this mission has no coordinator, launch the authorized native runtime in the
   returned coordinator surface, with target project cwd and complete brief. Choose
   the user's runtime preference first. Never spawn a second coordinator solely for
   display. Native runtime invocation, permissions and sessions remain owned by the
   existing runtime adapter. A shell surface is not a running agent.
4. When the coordinator delegates an independently runnable terminal worker, first
   create its isolated worktree through the existing execution workflow, then ask
   the presentation adapter for that worker's surface. The first is right of the
   coordinator, subsequent surfaces are below it, with at most three on the right.
   Launch once using the observed returned identity, never the focused/default pane.
   Native subagents without a terminal remain in the overview; do not simulate them
   with duplicate runtime sessions. A surface reused after interruption is inspected
   and reconciled before any send; repeated text may repeat an external effect.
5. Update status from actual native execution or canonical mission observations.
   RUN/REVIEW/WAIT/FAILED/STOPPED are observations; VERIFIED requires fresh delivery
   proofs. Missing observations are UNKNOWN. Model, ctx and quota remain unknown
   unless available from the runtime. An idle screen is not proof of a stalled task.
6. Close only owned, completed display resources after native process termination
   is observed. Preserve unfinished work and native resume references. No automatic
   process kill, worktree deletion or branch cleanup belongs to presentation.

## Adapter boundary and local invocation

The presentation adapter owns ensure-workspace, worker-surface and status. It does
not spawn agents, create worktrees, run tests, select models or authorize merges.
`auto` chooses available cmux; absence falls back to plain JSON/text. Explicit cmux
failure is reported, never disguised as success. A tmux adapter is deferred; it
can implement the same seam without changing the procedure above.

Run from this harness checkout (project paths below are examples):

```sh
node scripts/mission-presentation.mjs ensure --project /path/to/project --mission DEV-123 --adapter auto
node scripts/mission-presentation.mjs worker --project /path/to/project --mission DEV-123 --id native-worker-id --role worker --create-surface
node scripts/mission-presentation.mjs status --project /path/to/project --mission DEV-123 --id native-worker-id --state RUN
node scripts/mission-presentation.mjs status --project /path/to/project --mission DEV-123 --overview --id native-reviewer-id --role review --state REVIEW
```

Keep the same mission ID on resume. Identity and surface references live in the
multiplexer's metadata, not a second `.run/state.md` execution registry. Inspect
reported handles before sending anything. If a creation timed out ambiguously,
reconcile the existing workspace rather than retrying a launch.

## cmux implementation

Observed cmux 0.64.22 (102), socket v2. Official reference:
https://cmux.com/docs/api ; installed `cmux --help`, `new-workspace --help`,
`new-split --help` and `tree --help` were read on 2026-09-05.
Use structured CLI arguments, explicit workspace/surface identities and bounded
calls. Native status colors identify coordinator (violet), workers (blue) and
reviews (cyan); text carries status independently of color. Whole-pane background
color remains unsupported by this slice. No changes to the user's global theme.

Workspace: project plus mission; layout: coordinator left, workers stacked right.
The requested 40/60 width is a visual preference subject to native resizing support,
not a reason to overwrite unrelated window layouts. A plain fallback reports the
same identities without claiming a pane exists. Execution remains usable without cmux.
