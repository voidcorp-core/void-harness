---
date: 2026-07-22
title: "`init` auto-wires the Codex safety floor -- runtimes are symmetric, gated by `--runtime`"
---

## 2026-07-22: `init` auto-wires the Codex safety floor -- runtimes are symmetric, gated by `--runtime`

Context: `void-harness init` treated Codex as a second-class runtime. It emitted
`AGENTS.md` (doctrine) but the Codex *safety floor* -- `.codex/hooks.json` + resolvable hook
scripts + `${VOID_HOOKS_DIR}` -- was a manual three-step opt-in documented in `docs/CODEX.md`.
The Claude side, by contrast, was fully auto-wired (marketplace + `enabledPlugins` merged into
`.claude/settings.json`). The asymmetry meant a Codex-only project shipped with no enforced
floor unless the user hand-copied files, and was still nagged about `gh`/marketplace
prerequisites that only matter for the Claude plugin channel.

Decision: `init` wires each runtime's active layer symmetrically.

- **Runtime resolution.** A new `--runtime claude|codex|both` flag; default is the
  auto-detected footprint (`.claude/`/`CLAUDE.md` -> claude, `.codex/`/`AGENTS.md` -> codex),
  falling back to both on a greenfield project. `resolveRuntimes` + `detectRuntimes` are pure
  and unit-tested.
- **Codex floor auto-wired.** When Codex is selected, `init` stages the four floor scripts
  (`block-dangerous-bash.sh`, `protect-sensitive-files.sh`, and the sourced `_hooklib.sh` +
  `_checks.sh`) into `.void/hooks/`, and compiles `.codex/hooks.json` from the single source
  `packages/core/codex/hooks.json`, rewriting the `$comment` to a generated-file notice.
- **Gating.** A Claude-only wire skips the Codex floor; a Codex-only wire skips the
  `gh`/marketplace prerequisites, the core pin, the `settings.json` merge, and the Claude
  "restart + trust" checklist steps. Both doctrine docs are still always emitted (cheap
  pointers, future-proof). `doctor` gained a `codex floor` check that runs whenever a `.codex/`
  dir exists: every hook the manifest invokes must be a staged, executable script.
- **Freshness across upgrades.** The floor scripts ship inside the CLI package, so
  a staged floor lags after a CLI upgrade. `void-harness update` re-stages it to
  the running CLI's version, gated on a content-diff (`codexFloorDrift`) so a no-op
  update stays a no-op and the status reads fresh/refreshed honestly. This is the
  Codex analogue of update's existing Claude marketplace cache/pin refresh —
  `doctor` detects a broken floor, `update` reconciles a stale one. The
  materialization itself (`wireCodexFloor`) lives in `lib/codex-floor.ts` and is
  shared by `init` and `update`, writing the manifest via a temp-file rename so a
  reader never sees a half-written `.codex/hooks.json`.

Key sub-decision -- **the `${VOID_HOOKS_DIR}` placeholder compiles to the project-relative
`.void/hooks`, not an absolute path.** Rationale: `.codex/hooks.json` is a project-local config
a team commits (like `.claude/settings.json`); an absolute path would leak `$HOME` and break on
every other machine and in CI. Relative is committable and portable. The trade-off it accepts:
it assumes Codex runs hooks with cwd at the project root, mirroring Claude Code. That mirror is
consistent with CODEX.md's stated model ("same event names, schema, exit-code convention") but
is not yet E2E-verified against a real Codex run -- flagged as the one pending link in
`docs/CODEX.md` (§Status), alongside the already-pending end-to-end firing.

Rejected alternatives. (1) **Absolute resolved path** in the manifest -- zero-config and
cwd-independent, but not committable (leaks the local home dir, breaks across machines); wrong
for a file meant to live in the repo. (2) **Keep `${VOID_HOOKS_DIR}` and require a manual
`export`** -- committable and portable but leaves a manual step, which is the exact friction
this change removes; the point was to make `init` "nickel" for Codex. (3) **Keep the floor a
documented opt-in** -- rejected: it left Codex-only installs unenforced by default, the
opposite of the safety pillar. (4) **Conditionally emit only the selected runtime's doctrine
doc** -- initially rejected here (both docs as cheap future-proof pointers), but **superseded the
same day** by the runtime-adapter-seam decision: doc ownership is now per-runtime (each adapter
writes only its own doc), because always-both made a Codex-only project carry a `CLAUDE.md` it
never uses — the Claude-centric premise the agnostic-by-construction directive removes. See
`2026-07-22-runtime-adapter-seam-per-runtime-doc-runtime-add.md`.
