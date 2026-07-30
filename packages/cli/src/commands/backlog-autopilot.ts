// `void-harness backlog-autopilot` — retired. This is a signpost, not a command.
//
// The engine it fronted was replaced by `autopilot`, whose boundaries differ
// enough that forwarding would be a lie: workers are commit-only, merging is a
// human gate with no flag, and the run resumes from the active program rather
// than from arguments. An alias would keep old invocations "working" while
// giving them different behaviour, which is worse than failing.
//
// So it fails, loudly, with the one command that replaces it. It is kept routed
// rather than deleted for exactly one cycle: a removed command prints a generic
// "unknown command" and leaves the reader to guess what happened to theirs.
//
// It imports nothing. `legacy-boundary.test.ts` holds that, because the way a
// stub becomes an engine again is one helpful import at a time.

type Emit = (line: string) => void;

const MESSAGE = `
backlog-autopilot has been replaced by autopilot.

  void-harness autopilot --help

What changed, beyond the name:
  - workers commit only; the reconciler owns push, pull request and tracker state
  - merging is a human gate — there is no --auto-merge, on any path
  - a run resumes from plans/ACTIVE.md, so no ticket, cluster or run id is passed

There is no alias: the two engines do not behave the same, and a silent
forward would give your existing invocation different semantics.
`.trimStart();

/**
 * Always exits 2. Not 0 with a warning: a script that pipes into this command
 * must fail rather than continue against output that will never come.
 */
export function backlogAutopilot(_argv: readonly string[], emit: Emit = (line) => process.stderr.write(line)): Promise<2> {
  emit(MESSAGE);
  return Promise.resolve(2);
}
