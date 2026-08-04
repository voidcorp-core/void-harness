---
schemaVersion: 1
id: "adr:f3e97601-5e6a-4896-a026-2d59096d32b1"
createdAt: "2026-08-04T12:05:57.518Z"
title: "derived content is not committed; what breaks a fresh clone stays"
status: accepted
deciders: []
supersedes: []
---

# derived content is not committed; what breaks a fresh clone stays

## Context

The observed/declared split (`void-layout-ownership-split`) classified `derived`
state — everything `void-harness init` re-materializes from the harness assets pinned in
`.void/config.json` — and deliberately left it tracked, because the class could
not move one path at a time.

Measured on a freshly wired consumer project, that class is:

| directory | files | size |
| --- | --- | --- |
| `.claude/skills/` | 39 | 464 KB |
| `.agents/skills/` | 39 | 464 KB |
| `.claude/agents/` | 21 | 104 KB |
| `.codex/agents/` | 21 | 104 KB |
| `.claude/commands/` | 6 | 24 KB |
| `.void/hooks/` | 1 | 88 KB |

126 files and roughly 1.2 MB of vendored harness prose per repository, tracked by
default because nothing classified them — rewritten in full on every version
bump, and present in every review diff of every product PR that happens to follow
an update.

The relationship resembles a lockfile and `node_modules` — `config.json` names
the version and the bytes are regenerable — but the resemblance is partial and
the difference matters: `config.core` is a caret RANGE, not a lock, and `init`
materializes whatever assets the running CLI carries. See the reproducibility
limit under Consequences before leaning on the analogy.

## Decision

Ignore `derived` state, except the paths whose absence from a fresh clone is an
**error** rather than a degradation. The line is exactly that:

- `.void/hooks/` stays tracked. It is named from `.claude/settings.json`, which
  is `project` state and therefore committed; ignoring the runner while keeping
  the reference gives a clone a settings file pointing at a missing file, and
  every tool call fails on it.
- `.codex/hooks.json` stays tracked. It *is* the Codex safety floor. Absent, the
  floor is not there — a silently weaker clone, which is worse than either a
  working one or a loudly broken one.

Everything else (`.claude/skills/`, `.claude/agents/`, `.claude/commands/`,
`.agents/skills/`, `.codex/agents/`, `.void/PHILOSOPHY.md`) is ignored: without
them the agent has fewer capabilities until the next `init`, and nothing
errors.

An ignore rule cannot untrack what the index already holds, so existing projects
need an explicit step: `void-harness update --untrack-derived` drops them from
the index and leaves every byte on disk. It is opt-in and never implied, and
`doctor` reports the count as **advisory** rather than a failure — nothing is
broken by committing them.

## Consequences

Positive:

- A consumer repository commits what it authored and nothing else: on the test
  project, 136 tracked files became 9.
- A product PR stops carrying harness prose in its diff, so review sees the
  change under review.
- A version bump stops rewriting a megabyte of tracked content.

Negative:

- A teammate cloning gets no project-local skills until someone runs
  `npx voidharness init` (NOT `install`, which refuses a project install and
  redirects to `init`). The doctrine docs (`CLAUDE.md`, `AGENTS.md`) and the
  enforcement runner still ship, so the clone is functional and guarded, but it
  is less capable until re-materialized.
- **Rehydration is not exact, and this is the honest limit of the decision.**
  `config.core` is a caret range, not a lock; `init` materializes the assets of
  the CLI that runs it, and keeps an existing pin rather than resolving it. A
  clone can therefore receive content from a newer harness version than the
  author had. Nothing is lost — the content is regenerable — but "identical" is
  not a promise this makes today. Making it exact needs a committed manifest
  (exact version plus per-file hashes, `project` class) and a hydrate that
  installs that version and proves the restored hashes. Until that exists, the
  guarantee is "you can get A working set back", not "you get THE set back".
- Existing consumers must run one extra command once, and commit the resulting
  staged deletions.

## Alternatives considered

- **Keep committing everything** (the prior state, by default rather than by
  decision). Rejected: it is the reason a product repo's diff can carry thousands
  of lines nobody wrote, and it makes an update indistinguishable from a
  refactor at review time.
- **Ignore the whole derived class, including the hooks and the Codex floor.**
  Rejected on the fresh-clone test: the settings file names the runner, so the
  clone fails on every tool call, and a missing floor is a safety regression
  nobody would notice. Cleanliness is not worth a broken or silently unguarded
  clone.
- **Untrack automatically during `update`.** Rejected: it stages deletions across
  a repository the harness does not own. The user asked to update the harness,
  not to rewrite their index. Offering it as one explicit flag keeps the action
  available and the consent real.
- **Make it configurable per project.** Rejected: this repo is opinionated by
  construction, and a knob here would mean every consumer re-deciding a question
  that has one defensible answer.

## Reversal cost

Low on the harness side — reverting means classing those paths `project` in
`MATERIALIZED_OWNERSHIP`, and the ignore block regenerates on the next `update`.
Medium in the field: a consumer that ran `--untrack-derived` and committed would
need to re-add the files, which `init` regenerates anyway.
