---
date: 2026-07-10
title: "the server-side floor allows a lockfile change accompanied by a manifest change (DEV-393 follow-up)"
---

## 2026-07-10: the server-side floor allows a lockfile change accompanied by a manifest change (DEV-393 follow-up)

Building `apps/make-pdf` surfaced a real gap in the DEV-393 server-side floor (`ci-enforce.sh`): it blocked
**every** lockfile diff fail-closed, so the harness monorepo could never add a dependency — a legitimate
`pnpm add` (which moves `package.json` AND `pnpm-lock.yaml` together) was rejected exactly like a hand-edit.
The local PreToolUse hook was already correct (it blocks a direct `Edit`/`Write` to a lockfile; `pnpm add`
runs via Bash and is allowed), but the server replay was stricter than the local floor — an inconsistency.

Decision: `ci-enforce.sh` allows a lockfile change **only when a package manifest changed in the same diff**
(`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Gemfile`, `composer.json`, `pubspec.yaml`). A
lockfile changed **alone** — no manifest — stays blocked (the hand-edit / tamper case the floor exists to
catch). This is the standard shape of a dependency PR: the reviewer sees the new dependency in the manifest,
which is the human check the lockfile-tamper block was standing in for.

Load-bearing choices:
- **Manifest+lockfile is reviewer-visible; lockfile-alone is not.** The floor's job is to stop sneaky edits a
  review would miss (lockfile-only tampering, secret injection), not to forbid all dependency additions —
  which would make the monorepo unusable. Gating on manifest-accompaniment restores that intent.
- **Fail-closed preserved**: a `git diff` failure in the manifest pre-pass treats the manifest as absent, so
  the lockfile stays blocked. No new fail-open path.
- **Local hook unchanged**: hand-editing a lockfile via `Edit`/`Write` is still blocked; only the server replay
  learned the manifest-accompaniment rule, closing the local/server inconsistency.
- Tested: `ci-enforce.test.ts` gains "allows lockfile + manifest" (green, logged) and "blocks lockfile alone"
  (red) cases; the existing lockfile-alone-blocked test still holds.

Why: a floor that forbids ever adding a dependency is not a floor, it is a wall. The rule is the same one every
dependency PR already follows — the change makes the automated gate agree with how dependencies legitimately
land, without opening a tamper path.
