// `void-harness autopilot` — the deterministic operator surface of the autopilot
// bounded context. NOT yet wired into main.ts: range A builds the destination,
// range D moves the public surface onto it, so no release ever ships two engines.
//
// Functional core, imperative shell: `runAutopilotCommand` is a function of
// (argv, stdin, context) and returns what to print and with which exit code. The
// CLI itself contacts nothing — no tracker, no git, no agent. The skill hydrates
// observations, pipes them in, applies what comes back, and observes again.
//
// The only side effect that exists here is the run cursor under .void/autopilot,
// and it is written at exactly one moment: after a reservation has been proven
// converged by re-observation.

export const USAGE = `
void-harness autopilot — deterministic planning for the attended cluster mode.

Invoked by the /void-autopilot skill, which hydrates observations from the
tracker and pipes them in. The CLI computes; it never contacts Linear, GitHub or
git, and it spawns no agent.

Usage:
  void-harness autopilot scaffold <plan|start|status|marker> [--json]
  echo '<CandidateObservation>'  | void-harness autopilot plan   [--json]
  void-harness autopilot orchestrate [--json] < worktree-observation.json
  echo '<ChainObservation>'      | void-harness autopilot chain  [--for <2h|90m>] [--json]
  echo '<ReservationReceipt>'    | void-harness autopilot start  [--json]
  echo '<RemoteObservation>'     | void-harness autopilot status [--run <id>] [--json]
  echo '<RemoteObservation>'     | void-harness autopilot resume [--run <id>] [--json]
  void-harness autopilot abort [--run <id>] [--json]

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

