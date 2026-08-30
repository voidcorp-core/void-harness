---
title: The guards that are shipped and open
date: 2026-08-30
status: approved
author: Folpe + Claude
---

# The guards that are shipped and open

## Why this exists

This spec descends from measurement rather than design. On 2026-08-30 a day of adversarial
reading, a first sighted specialist panel and a first full team-mode run surfaced four defects
that are **already shipped**: guards that run in the harness today and let through what they
exist to refuse.

They were kept, rather than dropped, by the admission rule (`a-finding-enters-only-by-beating-the-work`)
for one reason: that rule compares a *finding* against the work in progress, and a shipped
defect does not compare against it. It is already costing.

Writing a spec for a bug pool is close to ceremony, and it is done here only because
`.void/program.md` requires `plan` and `spec` to name real paths, and pointing them at a closed
programme's documents would be the prose-that-lies failure this repository keeps paying for.
The mismatch is noted rather than worked around: the descriptor schema assumes every programme
descends from a design.

## What must become true

**A merge grant refuses what it cannot judge.** Three classes still pass. A `clean` verdict
carrying anchored contradictions is granted, because the contradiction list is only consulted
under a `contradicted` verdict -- the same shape as the severity hole closed the same day, and
the same lesson: the fail-closed rule lives at the point that authorizes, not only at the parsing
boundary. `package.json` and `.npmrc` are not merge-blocked while the lockfile is, although they
carry `prepack` and `prepare`, which execute on every install including a fresh clone. And the
first unit of a run is never projected against the budget, so a run declared for one minute
starts a ninety-five minute unit, contradicting an accepted decision.

**A human gate cannot be lifted by a spelling.** `humanGates` is compared to cluster tickets by
raw `Array.includes`. It has the same provenance the module already distrusts for `deployBranch`:
typed by a person into a descriptor and validated by nothing. So `dev-671` against `DEV-671`
matches nothing, the gate list comes back empty, and the one mechanism by which a person reserves
a decision for themselves is bypassed by a capital letter. This failure is **open**, unlike the
ref comparison, which mostly failed closed.

**An install that fails leaves nothing that lies.** The ignore block is written before the file
transaction commits and outside its scope. Since its content began enumerating the agents the
receipt owns, a failed install leaves a repository with rules naming agent paths that were never
written -- so a project's own agent under one of those names becomes invisible to git, silently,
at the first clone. The protection that placement bought (an install surviving a `git clean`)
must not be lost while fixing it.

**A file the harness cannot read is not a file it may replace.** `readSettings` swallows the
parse error and returns `{}`, so the caller merges into an empty object and rewrites the file. A
`.claude/settings.json` with one trailing comma is replaced, and the project loses its hooks,
permissions and environment. No `--force` is needed. `.void/config.json` already has its answer
in `configWriteVerdict`; this file is co-owned on the same footing and has none.

## Boundaries

Two guards are rewritten by two units. `judgeMergeGrant` is not a file two agents may edit in
parallel: a semantic conflict in the function that authorizes a merge is the class no tooling
resolves afterwards. They are sequenced by declaration, not by inference.

Both of them are human gates for a second reason: a run must not merge itself through a guard it
has just rewritten. That circularity is not addressed by any refusal the grant can return, so it
is addressed by a person.

## Acceptance

- [ ] A `clean` verdict carrying an anchored contradiction refuses, with a named reason.
- [ ] `package.json` and `.npmrc` are merge-blocked, with the reason written beside them.
- [ ] The first unit of a run is projected against the budget like every later one.
- [ ] A human gate declared in any casing, with or without a leading `#`, still gates.
- [ ] A ticket that is genuinely not gated still merges: no guard refuses everything.
- [ ] A failed install leaves no ignore rule naming a path that was never written.
- [ ] An unreadable `.claude/settings.json` is never replaced in silence, and the case is named
      before any write.
- [ ] Every one of the above is proven on a fixture proven grantable, so that a refusal for
      another reason cannot be read as the guard working.

## Non-goals

- Resolving real remotes when comparing branches. The documented false refusal stands.
- Loosening the integration-sha comparison. Exact and full-length, or a stale reading looks fresh.
- Reworking the descriptor schema's assumption that a programme descends from a design. Named
  here, not fixed here.
