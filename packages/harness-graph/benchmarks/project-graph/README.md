# ProjectGraph benchmark

Run `pnpm benchmark:project` from the repository root. The runner copies the checked-in monorepo
fixture into a fresh temporary root ten times per scenario and track. Every cold, unchanged,
sibling-activity, one-file-changed, and nine-files-changed observation runs in its own Node process.
Timing comes from `performance.now()` inside `buildProjectGraph`; peak memory is the isolated process
high-water mark from `process.resourceUsage().maxRSS`.

The `deterministicJournalPort` performance track injects the bounded in-memory cache and a controlled
implementation of the public journal port. It explicitly emits one event containing the exact changed
paths after project mutations and one separately identified sibling event after sibling activity. It
is never described as native. Samples assert `state: fresh` and all observable filesystem work: cold
scans/reads/hashes `12/12/12`; unchanged and sibling activity `0/0/0`; one changed file `0/1/1` plus
one exact inspect; and nine changed files `0/9/9` plus nine exact inspects. Unchanged and sibling
scenarios must retain the exact snapshot id and Graph v3 root hash.

The separate `nativeNodeJournal` capability track uses the real session journal and `fs.watch`
adapter. Every sample reports whether that adapter stayed `advisory`, stayed `unavailable`, or changed
capability during the sample (`mixed`). An advisory sample performs two complete bounded observations,
one before and one after Git, so a fresh 12-file sample reports `24/24/24` scan/read/hash work. The
native track never publishes fast-path percentiles. Uniformly unavailable samples assert the honest
`degraded` rebuild, `journal-unavailable`, no publication, and the same bounded verification work.
Mixed samples assert a closed `partial` or `degraded` result, the explicit issue, and no publication.
Unavailable or mixed is supported and does not fail the deterministic performance gate.

## DEV-436 deterministic baseline

Measured on 2026-07-28 with Node v25.9.0, Darwin 25.3.0, and an Apple M3. These are the p95 values from
ten isolated `deterministicJournalPort` samples per scenario:

| Scenario | p95 |
|---|---:|
| Cold | 252.27 ms |
| Unchanged | 28.02 ms |
| Sibling activity | 21.65 ms |
| One changed file | 34.12 ms |
| Nine changed files | 113.53 ms |

Peak isolated process RSS was 143,441,920 bytes (136.80 MiB). All observable work assertions and the
performance budgets passed.

## Native capability observation

The same dated run classified 48 of 50 `nativeNodeJournal` samples as `mixed` and two as
`unavailable`: ten observed `advisory -> unavailable`, 38 observed
`advisory -> unavailable -> unavailable`, and two stayed unavailable. The schema fixes
`nativeFastPathProven` to false. Native `fastPathP95Ms` and peak RSS are always `null`; no native
latency baseline is claimed. The track passed its fail-closed assertions.

The executable gates require all four incremental p95 values below 500 ms and isolated peak RSS
below 256 MiB. They are engineering regression budgets for this bounded fixture, not cross-machine
product guarantees.
