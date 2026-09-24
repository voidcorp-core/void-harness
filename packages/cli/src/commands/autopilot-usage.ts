// `void-harness autopilot` -- the operator surface of the continuous delivery
// loop. `runAutopilotCommand` is a function of (argv, stdin, context) and returns
// what to print and with which exit code. The loop reads GitHub and git through
// runners the context injects, so every command stays testable on captured
// outputs; it never contacts the tracker and spawns no agent.

import { autopilotFailure } from '../lib/autopilot/errors.js';

export const USAGE = `
void-harness autopilot -- the deterministic kernel of the continuous delivery loop.

Invoked by the /void-autopilot skill, which reads the tracker and pipes it in.
The CLI decides; it never contacts Linear and spawns no agent. It reaches GitHub
through gh and the shared Git state itself, because GitHub is the authority on a
merge and the shared state is what a unit must not have touched.

Usage:
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

There is no --auto-merge flag. A machine merge is declared once in the program
(autopilot.mergeGate: union-reviewed, plus deployBranch), and the loop arms one
only on a head a signed verdict proves, never into the branch that deploys.
`.trimStart();

/**
 * Every subcommand this CLI answers, and whether it reads an observation.
 *
 * One table: the router refuses a name it does not hold, and the pipe is filled
 * for exactly the names it marks `reads-stdin`. A second, hand-kept list once
 * left a gate reading an empty string for as long as it existed.
 */
export const SUBCOMMANDS = Object.freeze({
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

/** The first bare word of argv: the subcommand, before any flag or its value. */
export function subcommandWord(argv: readonly string[]): string | undefined {
  return argv.find((arg) => !arg.startsWith('-'));
}

/** Whether this invocation waits on a pipe, resolved from the subcommand alone. */
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
