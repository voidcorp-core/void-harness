# Repair mission review continuity

Authorized by the explicit maintainer instruction on 2026-09-19. This is the
prerequisite for the three engaged missions, not the future general engine.

## Sequence and ownership

1. Pure review cycle and diagnostics, owned by mission_rounds_red: RED incident
   reproductions, unchanged partial fan-out, last legal round, changed input and
   explicit writer boundary, all stops explain cause and remedy. Keep failure
   retries, true exhaustion, malformed results and reused contexts refused.
2. Pure evidence obligations, owned by mission_evidence_contract: exact specialist
   clarification of legacy requests, persistent deadlines, fresh sealed proof
   discharge. Classification never alters findings, verdicts or limitations.
3. Pure lifecycle/recovery, owned by mission_recovery_core: immutable original
   journal, validated episode transition, narrowly demonstrated defect mapping,
   no caller-provided budget. Root owns the corresponding spec and ADR.
4. CLI adapter after core contracts settle: strict schemas, runtime/assets
   provenance, normalized observations and journal hash compare-and-append under
   the same lock. Every closed-state reader uses the common projection.
5. Independent complete-diff review, type/lint/test/contract checks, then isolated
   demonstration on copies of all three incident journals. Check original hashes
   and installed runtime surfaces before and after.
6. Use a supported explicit recovery on the real missions only after that proof.
   Resolve original findings and finish tests/delivery. Close owned agent panes
   after their final results are collected, preserve worktrees and evidence,
   update checkpoint, then clear and begin general engine work.

## Recovery contract

`mission recover --id <id> --input <json> [--json]` is distinct from resume and
never implicitly dispatches or executes an effect. Request binds schemaVersion,
closureEventId, expectedJournalHash and a typed disposition. Defect dispositions
name partial fan-out or stale-input dispatch. Review-blocker dispositions bind
original completion IDs and a hashed resolution artifact; that artifact is input,
not approval. The core alone calculates admissibility and true remaining budget.

Receipt binds closureEventId, previousEpisodeId, priorJournalHash,
priorJournalLastSeq and requestHash, plus bounded trusted observations needed to
replay admission. The recovery event itself identifies the new episode. Legacy
unscoped closure is valid only in the initial episode. An identical retry is
idempotent. Concurrent or conflicting input, unsupported lineage, ambiguous effects,
non-controller terminal closures and genuine exhaustion refuse.

Proven partial fan-out normalization does not forgive real writer correction or
failure attempts. An inadmissible completion remains in the journal and is named
as invalidated; it never becomes fresh evidence merely because recovery occurred.
Proof obligations and findings are read from original history, not a filtered
review projection. Generic blocker recovery admits bounded correction or specialist
clarification only and keeps the blocker until a qualified disposition resolves it.

## Admission versus execution capability

Recovery validates and appends a journal transition; it never launches a specialist
or executes a work effect. An unavailable native installation refuses admission.
An attested, healthy runtime whose execution capability is explicitly degraded may
admit recovery while returning its status and limitations unchanged. Dispatch keeps
its execution policy; recovery neither promotes capability nor approves a finding.

Historical incident demonstration uses the production recovery adapter with explicit
ProjectRoots: original worktree as a read-only observation source and copied journals
as the isolated installation root. A separately identified candidate bundles the
repaired CLI with immutable released 3.8.0 assets through existing asset discovery.
Record both source and asset provenance. This proves adapter admission and append,
not installation or activation of the public CLI in a consumer project. Standard
builds remain versioned-source-only; no build reads incident journals or home state.

## Evidence contract

Completion v1 is unchanged; unclassified legacy requests are currently due.
Controller-issued clarification and a native specialist response bind exact
completion ID/hash, specialist, fresh context, request indexes/text hashes and
complete coverage. Typed deadlines are current-review, post-implementation and
completion. No regex inference or silent delay of an already overdue obligation.
Stable obligation identities survive replacement/stale completions. Discharge
references exact obligations and canonical fresh sealed proof events through the
existing Evidence assessment contract. Writer receipts never discharge proof.

## Verification constraints

Strict TDD, tests through serialized RUN with one Vitest worker for targeted checks.
No hand-edited generated assets or lockfiles. No real mission event is hand-edited.
Do not mutate published hooks, native role definitions or consumer installations.
If activation actually needs release/installation, present the verified candidate
and concrete activation separately for authorization. No principle approval is
needed again for the repair already requested.

Independent design review requires explicit disposition of preparation-correction
proof bypass, recovery mistaken for approval and future obligations disappearing
on replacement review. Current-evidence refusal is a mandatory regression test.
