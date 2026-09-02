---
schemaVersion: 1
id: "adr:0b5ff79a-61ec-434c-87a2-7e954b3531ff"
createdAt: "2026-09-02T20:33:49.664Z"
title: "Every reader of the installation names it in its remedies, and the runtime writer takes its directory as given"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:17317198-fbc2-4bb5-8fda-2e1e4f7ac9bb"]
---

# Every reader of the installation names it in its remedies, and the runtime writer takes its directory as given

## Context

This record carries forward the decision of 2026-09-02, "Runtime state from a worktree belongs
to the repository" (`adr:17317198-fbc2-4bb5-8fda-2e1e4f7ac9bb`), which it supersedes. The
measurement that produced it, run `run-2026-09-02-chain-b`, a DEV-704 worker answered `blocked`
from its linked worktree because the twenty-one installed agents sat in the main checkout, and
the resolver it introduced, `resolveProjectRoots` with `workRoot` and `installRoot`, stand as
written there. Three of its sentences were found inexact by the union readings of run
`run-2026-09-02-chain-c` (DEV-740, DEV-741, DEV-768), and an accepted record is not edited.

**The telemetry fallback.** The record said the hook runner writes its telemetry to
`VOID_PROJECT_ROOT`, else `CLAUDE_PROJECT_DIR`, "else the root it discovers from its working
directory". That third fallback exists, but for the enforcement and lifecycle paths
(`packages/hook-runner/src/cli.ts`, `projectRoot()`, `discoverProjectRoot(process.cwd())`).
The runtime-event writer the sentence was about, `recordRuntimeEventFromCli` in
`packages/hook-runner/src/record.ts`, takes `process.cwd()` as it is. The two coincide when the
hook runs at the root of the tree, which is where Claude and Codex run hooks; they differ from a
subdirectory, where the enforcement path finds the tree and the writer records where it stood.

**"Breaks no existing install."** The record said that preferring the tree which holds the
install receipt "costs one file check and breaks no existing install". That is true of every
install that carries a receipt. The receipt dates from 2026-07-24 (`2aa22236`); a marketplace
install made by an earlier version has none, and `update` wrote one only on its two local routes,
rebuilt from the manifest. The marketplace route, which is exactly where an install without
receipt or manifest lands, left the tree unmarked. Such an install in a linked worktree resolved
`installRoot` to the main checkout, which holds nothing.

**The remedy rule, answering one case twice.** The superseded record states the rule twice. Once
positively: every remedy a reader of `installRoot` prints carries `remedyPrefix`, and it names
`doctor --fix` among them. Once as an exception: a reader naming a command that itself reads
`installRoot` leaves it bare, since that command does what it says wherever it is typed, and it
names `doctor` pointing at `check` as the case. `doctor --fix` satisfies both descriptions -- it
is one of the enumerated remedies and it resolves `installRoot` itself
(`packages/cli/src/commands/doctor.ts`) -- so the two sentences answer it differently. The
staleness remedy of the hook runner (`packages/cli/src/lib/runner-staleness.ts`, `npx
voidharness@latest doctor`) is the same shape.

## Decision

`.void/machine/` is per-repository state, and from a linked worktree it is written and read in
`installRoot`; readers of the installation (the panel, agents, skills, installed doctrine, hook
bundle, manifest, and with them `status`, `check`, `mission` and `doctor`) go through
`installRoot`; the session checkpoint stays in the tree the session sat in; the writers of the
installation (`init`, `add`, `remove`, `update`, `hydrate`, `runtime add`) act on the directory
they run in. All of that is unchanged from the superseded record and is not restated further.

One rule holds for every reader of `installRoot`, and it has no exception: everything such a
reader prints about that root names it when the two roots differ. A remedy carries
`remedyPrefix`, a path is written in full through `installedPath`, and both helpers stay the only
place the rule lives. Whether the named command would resolve `installRoot` on its own is not
part of the test, and that is the whole amendment: the exception of the superseded record made
the wording of a line depend on the implementation of the command it names, which is why one
case (`doctor --fix`, and with it the staleness remedy) got two answers. The prefix does not
order a `cd`; it says which of the two directories the line is about, and a reader who has just
been told that the installation is elsewhere needs that on every line, including the ones a
command would have got right by itself.

That rule covers `doctor --fix`, which is a reader of `installRoot` like any other: its blocked
notice and the paths it reports writing name that root. A command printing no remedy at all
(`mission`, whose usage lines name subcommands, not repairs) is not an exception to this; it has
no line to prefix.

The runtime-event writer of the hook runner takes its directory as given: `VOID_PROJECT_ROOT`,
else `CLAUDE_PROJECT_DIR`, else the directory it was started in, with no discovery. It is
advisory and must never cost or block a tool call, and a walk up the tree on every hook
execution would be paid by every project for the one case it would serve, a native Codex
subagent started in a subdirectory. That case is the adapter's to close, by exporting the root
to the workers it starts (DEV-738); the writer records where it was told to, or where it stood.
The enforcement and lifecycle paths keep discovering the tree from their working directory,
because a rule judged against the wrong root refuses the wrong file.

`update` writes the install receipt on its marketplace route as well (DEV-740). The receipt
claims no file, since nothing on that route proves which bytes this machine wrote; it records
the channel, the wired runtimes and the version the pins now name. So the statement holds for
every install that has run `update` since: from a linked worktree, the tree that holds the
receipt is the installation. An install that predates the receipt and has not run `update`
resolves to the main checkout from a linked worktree until it does, and `doctor`'s receipt
advisory names `update` as the remedy.

## Consequences

Positive:

- The record says what `record.ts` does, and the reason the writer does less than the
  enforcement path is written down, so the next reader of that line does not "fix" it into a
  directory walk on every tool call.
- A marketplace install older than the receipt is marked by the first `update` it runs, and a
  linked worktree that is itself such an install is then read as one.
- Writing a line that speaks of the installation no longer requires reading the source of the
  command it names. `remedyPrefix` and `installedPath` answer it, and a new reader inherits the
  rule by using them.

Negative:

- Until that `update` runs, the same install in a linked worktree is still read as the main
  checkout's. Accepted: the remedy is the one `doctor` already printed, and the mechanism that
  marks the tree is now on every route.
- A receipt that owns no file proves nothing about the project files a pre-receipt install wrote;
  `update` on that install still cannot reclaim them. That is the state before this record, now
  recorded rather than implied.
- A remedy that would have been correct typed anywhere is now prefixed anyway, so a reader may
  read `in <installRoot>: ` as an instruction they did not need. Accepted: from a worktree the
  prefix is never wrong, only redundant on that subset, and the alternative costs a source read
  per printed line.

## Alternatives considered

- **Align the writer on `discoverProjectRoot`.** Would make the superseded sentence true instead
  of the record. Rejected: the writer runs on every tool call of every runtime, and the case it
  would serve is the adapter's defect (DEV-738), not the writer's; the record is corrected to
  the code.
- **Keep the exception and leave `doctor --fix` bare.** Would honour the reading that a command
  resolving `installRoot` needs no prefix. Rejected: the line the reader actually gets from a
  clean worktree then says their tree has uncommitted changes, about a tree they are not in, and
  every future line inherits a rule whose answer depends on an implementation detail of the
  command it names.
- **Narrow the sentence to installs carrying a receipt, and write nothing.** Would make the
  record true and leave the install stranded, with `doctor` printing a remedy (`update` writes
  one) that the marketplace route did not honour. Rejected: the receipt writer exists on the
  local routes and costs one file on this one.

## Reversal cost

Low. The remedy rule is two helpers in `project-roots.ts` and their call sites, the writer's
fallback is one expression in `record.ts`, and the marketplace receipt is one function in
`update.ts`. Reverting the second restores an install `doctor` cannot find from its
own worktree, so the reason would have to be a better mark for the tree than the receipt, not
the absence of one.
