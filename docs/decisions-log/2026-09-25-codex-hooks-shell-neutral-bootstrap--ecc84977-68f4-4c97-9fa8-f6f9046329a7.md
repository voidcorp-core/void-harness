---
schemaVersion: 1
id: "adr:ecc84977-68f4-4c97-9fa8-f6f9046329a7"
createdAt: "2026-09-25T16:13:14.467Z"
title: "Codex hook commands find the runner from the session directory with a shell-neutral Node bootstrap"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Codex hook commands find the runner from the session directory with a shell-neutral Node bootstrap

## Context

`.codex/hooks.json` is versioned. Since the portable Node floor
(`adr:f8861a2b-b9d6-43d5-b6d1-ec02eb6856bb`), `init` compiled each command with the absolute
path of the checkout that ran it. A clone, a worktree or a CI checkout then inherited a path
that was not its own, and every Codex hook failed with a non-blocking error: the whole Codex
floor went silent. It happened on `develop` with #428 (DEV-918).

Codex runs a hook command in the session cwd, through a shell. Its source (openai/codex
`55543d8`, `hooks/src/engine/command_runner.rs` and `core/src/shell.rs`) uses the session shell
(`sh`, `bash` or `zsh` with `-c`; PowerShell with `-NoProfile -Command`; `cmd /c`), and without
one `$SHELL -lc` on POSIX or `%COMSPEC% /C` on Windows. Codex exposes no project-root variable
to project hooks. The official hooks page recommends `"$(git rev-parse --show-toplevel)/..."`,
which `cmd.exe` does not expand, and a `command_windows` override that would still have to work
under both `cmd.exe` and PowerShell.

## Decision

Each compiled command is `node -e "<bootstrap>" <args>`: a program that walks up from the cwd
to the nearest `.void/hooks/<asset>`, runs it, and fails closed on `enforce` (exit 2) and open
elsewhere when no runner is found, the runner's own exit policy.

## Consequences

Positive:

- The manifest depends on the template alone: byte-identical in every clone and worktree.
- One form for every launcher. The bootstrap uses no `$`, `%`, backtick, backslash, `!` or
  nested double quote, so no shell expands or splits it.
- No dependency on Git; a session started in a subdirectory finds the runner.
- A missing runner now blocks enforcement instead of letting every tool call through.

Negative:

- Each command is about 560 characters, repeated in the manifest; the source of truth is the
  one `codexHookBootstrap` function, not the generated file.
- Nested projects resolve to the nearest staged runner, not to the directory holding the
  `.codex/` layer that declared the hook.

## Alternatives considered

- Git root substitution with a `command_windows` override: rejected, two forms to prove, a
  dependency on Git, and no single Windows form covers both `cmd.exe` and PowerShell.
- A project-relative path: rejected, it breaks every session started in a subdirectory.
- The absolute path of the final project: rejected, it is the defect this decision removes.

## Reversal cost

Low. The template keeps `${VOID_HOOKS_DIR}`; only the compiler and its tests change.
