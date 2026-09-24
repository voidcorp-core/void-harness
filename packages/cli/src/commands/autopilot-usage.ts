// `void-harness autopilot` — the deterministic operator surface of the autopilot
// bounded context. NOT yet wired into main.ts: range A builds the destination,
// range D moves the public surface onto it, so no release ever ships two engines.
//
// Functional core, imperative shell: `runAutopilotCommand` is a function of
// (argv, stdin, context) and returns what to print and with which exit code. The
// cluster subcommands contact nothing — no tracker, no git, no agent. The skill
// hydrates observations, pipes them in, applies what comes back, and observes
// again. The loop subcommands (autopilot-loop.ts) read GitHub and git through
// runners the context injects, so they stay testable on captured outputs.
//
// The only side effect that exists here is the run cursor under .void/autopilot,
// and it is written at exactly one moment: after a reservation has been proven
// converged by re-observation.

import { autopilotFailure } from '../lib/autopilot/errors.js';

export const USAGE = `
void-harness autopilot — deterministic planning for the attended cluster mode.

Invoked by the /void-autopilot skill, which hydrates observations from the
tracker and pipes them in. The CLI computes; it never contacts Linear and spawns
no agent. Only the continuous loop commands (next, fingerprint, review-key, arm,
disarm, verdict) reach
GitHub through gh and the shared Git state themselves, because GitHub is the
authority on a merge and the shared state is what a unit must not have touched.

Usage:
  void-harness autopilot scaffold <plan|start|status|marker> [--json]
  echo '<CandidateObservation>'  | void-harness autopilot plan   [--json]
  void-harness autopilot orchestrate [--json] < worktree-observation.json
  echo '<ChainObservation>'      | void-harness autopilot chain  [--for <2h|90m>] [--json]
  echo '<ReservationReceipt>'    | void-harness autopilot start  [--json]
  echo '<RemoteObservation>'     | void-harness autopilot status [--run <id>] [--json]
  echo '<RemoteObservation>'     | void-harness autopilot resume [--run <id>] [--json]
  void-harness autopilot abort [--run <id>] [--json]

Continuous loop:
  echo '<LoopTracker>'           | void-harness autopilot next [--json]
  void-harness autopilot stop --drain | --now [--json]
  void-harness autopilot fingerprint [--before <ticket> | --after <ticket>] [--json]
  void-harness autopilot review-key [--json]
  void-harness autopilot arm --ticket <id> --pr <number> --head <sha> [--json]
  void-harness autopilot disarm --pr <number> [--json]
  echo '<ReviewVerdict>' | void-harness autopilot verdict --ticket <id> --pr <number> [--json]
  echo '<ConflictClass>'         | void-harness autopilot judgment conflict-class

next reads .void/program.md, the Linear state on stdin, GitHub (gh) and the stop
signal, and prints the actions for each slot: assign, wait, hand-back-to-worker,
mark-human-wait, enable-auto-merge, disable-auto-merge, rerun-review-check,
requeue, drain, freeze, recap, with the humanWaitLabel a mark-human-wait sets
(autopilot.humanWaitLabel, default void:human-wait); humanWait on stdin is that
label's presence. It never acts on them. stop writes
.void/machine/autopilot/stop, read before every assignment; delete the file to
start again. fingerprint records (--before, once per ticket) or checks (--after)
the digests of the shared Git state around one unit: local config and its
includes, stash, tags, notes, remotes, the local base and deploy branches,
replace refs, hooks/ and info/. The upstream (remote, merge) of every branch but
those is left out, since units in flight set and remove their own. --after fails
when it moved, and a second --before is refused. review-key draws the Ed25519
review key once: the private half into .void/machine/autopilot/review-key.pem
(mode 0600, refused unless git ignores it), the public half into
.github/void-review.pub, for a person to merge into the base; again, it only
rewrites the public half. verdict is the only path that writes a review verdict:
it admits it, checks its headSha is the pull request head now, posts the verdict
comment signed by the review key over the repository, ticket, pull request, head,
outcome and findings, then the void/independent-review status on that head, and
re-runs the independent-review job when its completed run disagrees. The
required job verifies the signature with the public key on the base branch;
next believes the latest signed verdict on the head only when the status agrees
and the key on the base is this checkout's own. review-key and verdict run only
in the orchestration checkout, never in a linked worktree. arm answers
enable-auto-merge: it records the head in .void/machine/autopilot/armed/<id>.json,
arms on exactly that head, and reads GitHub back: armed is an auto-merge request
or, once the checks pass on a base with a merge queue, a queue entry; a head
already merged counts. disarm answers
disable-auto-merge, which next returns before any outcome that stops watching
an armed pull request: its head moved since arm recorded it, no signed verdict
proves it, no arm recorded it, a worker or a person takes the ticket, or an
immediate stop; it turns the auto-merge off, dequeues, reads GitHub back and
fails while still armed. judgment admits a conflict class, bound to its
headSha, and prints the comment block to post; next reads the latest one back
from GitHub, so no session has to remember it.

stdin JSON (LoopTracker):
  { "schemaVersion": 1, "queue": <CuratorQueue judgment>,
    "tickets": [{ "id", "status", "humanWait", "pullRequest"?, "branch"?,
                  "footprint"?, "readiness"? }],
    "recent": [{ "ticketId", "outcome": "merged" }
             | { "ticketId", "outcome": "human-wait", "reason" }],
    "liveWorkers": ["<ticket id>"], "quota": "ok" | "low" }

--run is optional everywhere. With no run, a single non-terminal run is resumed;
several return competing-runs and nothing is touched.

orchestrate accepts schemaVersion 2 with action prepare or cleanup. Prepare needs
explicit ticketBranches and a complete worktrees observation (environment,
physical destinations, Git refs, caseSensitive and localData). Paths are absolute.
Cleanup after a later human merge needs the saved plan, verified integration,
actual merge ticket IDs/SHA and fresh inventory. Version 1 is refused, never guessed.
Both actions PLAN argv; they do not execute Git. Preserve argv and use shell:false.
Full examples and safe recovery: docs/WORKTREES.md.

stdin JSON (CandidateObservation):
  {
    "schemaVersion": 1,
    "tickets":    [{ "id", "ready", "priority", "boardOrder", "blockedByOpen",
                     "dependsOn": [], "estimate": number | null }],
    "footprints": [{ "id", "areas": [], "highRisk": false, "confidence": 0..1 }],
    "clusterSize":   4,    // optional ceiling, 1..4 (default 4)
    "minConfidence": 0.5   // optional; below it a footprint is doubtful
  }

stdin JSON (ReservationReceipt): { "intent", "applied": [], "reobservation" }
stdin JSON (RemoteObservation):  { "tracker", "pullRequest", "workerRefs",
                                   "trackerStates"?, "ticketStates"? }

pullRequest carries either a bare state ("open" | "merged" | "closed") or the
full observation — number, state, headRef, headSha, baseRef, baseSha, mergeSha,
checks. Only the full form yields a recovery verdict: a bare "open" cannot tell a
branch that matches the local tree from one whose base moved underneath it.

Add trackerStates: { "review", "done" } to also get the tracker lifecycle plan.
Without it no transition is planned — the CLI never guesses what your board calls
a state. ticketStates maps a ticket id to its observed state, so a write that
would change nothing is skipped rather than sent.

There is no --auto-merge flag. A machine merge is declared once in the program
(autopilot.mergeGate: union-reviewed, plus deployBranch), and is granted only for
a target that does not deploy and a union review that came back clean. A granted
merge is one "gh pr merge" bound to the head the grant read, handed back by grant
as argv; landed then reads the merge commit back, and only that is a merge.
`.trimStart();

/**
 * Every subcommand this CLI answers, and whether it reads an observation.
 *
 * There used to be two answers to that question. The router knew eighteen
 * subcommands; the shell that fills stdin knew a hand-kept list of five, and
 * `reconcile` was not on it. So the footprint audit -- the one gate that decides
 * whether a worker's range carries a neighbour's files -- was handed an empty
 * string and replied "the reconcile observation on stdin is not valid JSON" to
 * valid JSON, for as long as the command has existed. Ten more steps were inert
 * the same way: `orchestrate`, `verify`, `gate`, `publish`, `progress`,
 * `grant`, `reserve`, `base`, `observe` and `lifecycle` all parse stdin and all
 * received nothing. Only `scaffold` and `abort` genuinely read no pipe.
 *
 * A second list that has to be remembered is the defect, not the entry that was
 * forgotten, so there is one list. The router refuses a name this table does not
 * hold, and the pipe is filled for exactly the names it marks `reads-stdin`.
 */
export const SUBCOMMANDS = Object.freeze({
  scaffold: 'no-stdin',
  plan: 'reads-stdin',
  chain: 'reads-stdin',
  orchestrate: 'reads-stdin',
  reconcile: 'reads-stdin',
  verify: 'reads-stdin',
  gate: 'reads-stdin',
  publish: 'reads-stdin',
  progress: 'reads-stdin',
  grant: 'reads-stdin',
  landed: 'reads-stdin',
  reserve: 'reads-stdin',
  base: 'reads-stdin',
  observe: 'reads-stdin',
  lifecycle: 'reads-stdin',
  start: 'reads-stdin',
  status: 'reads-stdin',
  resume: 'reads-stdin',
  abort: 'no-stdin',
  next: 'reads-stdin',
  stop: 'no-stdin',
  fingerprint: 'no-stdin',
  'review-key': 'no-stdin',
  arm: 'no-stdin',
  disarm: 'no-stdin',
  judgment: 'reads-stdin',
  verdict: 'reads-stdin',
} as const);

export type AutopilotSubcommand = keyof typeof SUBCOMMANDS;

/**
 * The first bare word of argv, skipping the value `--run` consumed.
 *
 * Filtering on the argument's own index rather than on `indexOf`, which returns
 * the FIRST occurrence: with the same word twice in argv the old form asked
 * about the wrong position.
 */
export function subcommandWord(argv: readonly string[]): string | undefined {
  return argv.filter((arg, index) => !arg.startsWith('-') && argv[index - 1] !== '--run')[0];
}

/**
 * Whether this invocation waits on a pipe.
 *
 * Resolved from the subcommand, never from "does any argument look like a step":
 * `abort --run plan` names a run, and matching anywhere in argv made the shell
 * wait on a pipe `abort` never reads.
 */
export function readsStdin(argv: readonly string[]): boolean {
  if (argv.includes('--help') || argv.includes('-h')) return false;
  const word = subcommandWord(argv);
  if (word === undefined || !Object.hasOwn(SUBCOMMANDS, word)) return false;
  return SUBCOMMANDS[word as AutopilotSubcommand] === 'reads-stdin';
}


/** The value after `flag`, or undefined when the flag is absent. */
export function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw autopilotFailure(
      'AUTOPILOT_USAGE',
      `\`${flag}\` was given without a value`,
      'the flag consumed the next argument, which is another flag or missing',
      `pass a value after \`${flag}\`, or drop the flag entirely`,
    );
  }
  return value;
}
