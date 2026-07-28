---
schemaVersion: 1
id: "adr:2c5736fe-1fe3-4594-b870-ccbdd99ab11d"
createdAt: "2026-07-28T14:37:40.664Z"
title: "Cache freshness outside the consumer project and keep the notice advisory"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Cache freshness outside the consumer project and keep the notice advisory

## Context

npm is the primary installation channel, yet nothing in the product compared the installed harness
against the published version. `check` and `doctor` only ever queried the Claude marketplace on
GitHub, which additionally requires repository access and exits non-zero when that fetch fails — so a
public user installed through `npx voidharness` could not learn they were behind. The maintainer's own
machine demonstrated the gap: it ran `0.17.0` while `2.1.0` was published, silently, for weeks.

Adding a version check touches three sensitive properties at once. It introduces the first outbound
request on an ordinary user path, it must write a cache somewhere, and it must decide how loudly to
speak. The harness promises zero phone-home, promises not to pollute the repositories it is installed
into, and promises that a health surface never fails on something advisory.

## Decision

Cache the published version in the user cache directory (`XDG_CACHE_HOME`, else `~/.cache`), never
inside the consumer project, and treat a behind verdict as advisory everywhere it surfaces.

The registry read is a single GET to the public dist-tags document with a bare user-agent: no token,
no cookie, nothing about the machine, and it is refreshed at most once every 24 hours. Session start
reads the cache synchronously and refreshes it only after its output is written, so a slow or dead
registry can never delay a launch. A verdict that cannot be established is reported as `unknown` with
its cause and never rounded up to "up to date", and the update command is only ever named for an
install this CLI actually owns.

## Consequences

Positive:

- A consumer on the primary channel finally learns that a release exists, without running a command
  they would have to know about first.
- The consumer repository gains no new file, so nothing has to be gitignored and no runtime artifact
  can be committed by accident.
- Several projects sharing one installation share one registry round-trip per day.
- A network failure, a captive portal, a rate-limit or a corporate proxy degrades to an explicit
  unknown instead of a wrong reassurance or a failed health run.

Negative:

- The notice can lag by one session, because the refresh deliberately happens after the banner is
  emitted rather than before it.
- A machine with no resolvable home directory silently loses caching and pays one lookup per run.
- The cache lives outside the project, so clearing it is not covered by cleaning the repository.

## Alternatives considered

- **Write the cache under the project's `.void/`.** Rejected: it drops a runtime artifact into
  someone else's git tree and depends on them gitignoring it correctly. Freshness is a property of the
  installation, not of the repository being worked on.
- **Fetch synchronously during session start.** Rejected: it puts a network round-trip on the critical
  path of every launch, and a hanging registry would be felt as a slow agent.
- **Reuse `packages/cli/src/lib/version.ts` for the comparison.** Rejected: that comparator parses
  each dotted segment with `parseInt`, so it reads `2.2.0-rc.1` as `2.2.0` and could announce a false
  up-to-date. A stricter refusal to compare is the honest answer.
- **Make an outdated install fail `doctor`.** Rejected: an outdated harness still works, and a version
  check able to fail a health run would turn a transient network hiccup into a broken pipeline.
- **Notify unconditionally, whatever the install channel.** Rejected: advising `void-harness update`
  to a marketplace install is a confidently wrong instruction; silence beats a plausible wrong fix.

## Reversal cost

Low. The freshness modules are additive and isolated behind one function per surface; removing the two
call sites restores the previous behaviour, and the cache file is disposable state outside every
repository.
