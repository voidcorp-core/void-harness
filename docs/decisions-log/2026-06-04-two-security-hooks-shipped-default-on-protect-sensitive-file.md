---
date: 2026-06-04
title: "two security hooks shipped default-on (protect-sensitive-files, block-dangerous-bash)"
---

## 2026-06-04: two security hooks shipped default-on (protect-sensitive-files, block-dangerous-bash)

Context: the harness shipped quality hooks but no safety floor for destructive
actions, and nothing protecting secrets/lockfiles from accidental edits. This is
the prerequisite for any unattended run and a general improvement.

Decision: add `protect-sensitive-files` (PreToolUse Edit|Write — blocks `.env*`
secrets, private keys, credential files, lockfiles, `.git/` internals) and
`block-dangerous-bash` (PreToolUse Bash — blocks recursive root delete, fork bomb,
raw-device writes, force-push without `--force-with-lease`, destructive SQL). Each
has a single deliberate-override env var (`VOID_HARNESS_ALLOW_SECRET_EDIT`,
`VOID_HARNESS_ALLOW_DANGEROUS`) so legitimate cases are unblocked explicitly while
the default is safe. Wired into the core plugin PreToolUse (now 10 hooks).

Alternatives rejected:
- Warning-only (non-blocking): a destructive command warned-but-allowed is not a
  floor. These are irreversible; they block.
- No override: would force users to disable the hook entirely for a one-off
  legitimate edit. A scoped env override is safer than an all-or-nothing toggle.
