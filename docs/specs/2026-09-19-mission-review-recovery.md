# Mission review continuity and audited recovery

Status: approved behavior from explicit maintainer instruction on 2026-09-19;
implementation contracts below remain subject to independent review.

## Problem and outcome

DEV-630 exhausted its preparation review budget when an unchanged incomplete fan-out
was redispatched. WORK-3 received a second-round envelope which the completion reducer
then rejected because no writer boundary intervened. DEV-844 stopped with an empty
reason list. The installed 3.8.0 controller closed these missions and provides no
supported reopening operation. Existing journals and findings are evidence, not data
to edit or discard.

The repair must make producer and validator agree, preserve true safety limits and
permit an explicit, evidenced recovery. It must not become the new general mission
engine, a second orchestrator, or an exception that lets any failed mission proceed.

## Required behavior

1. A missing specialist in an unchanged incomplete panel remains in the same review
   cycle. Repeated dispatch is idempotent with respect to cycle budget.
2. A new cycle has an explicit admitted cause. Dispatch and completion validation use
   the same rule for writer correction and changed reviewed inputs. They never emit
   an envelope that their own boundary rules subsequently reject.
3. Evidence required now is distinct from verification due after implementation.
   Future obligations persist and become blocking when due. Missing current evidence
   remains blocking. Do not infer deadlines from prose or ignore requests on PASS.
4. Every stop identifies its concrete cause and corrective action. No empty reasons.
5. Recovery is explicit and auditable. Keep mission identity and the complete original
   journal. Reuse only fresh compatible evidence, invalidate stale evidence, replay no
   effect, and never silently reset budgets. Refuse arbitrary reopening or genuine
   exhaustion. Repeating a recovery is idempotent; concurrent changes refuse.

## Bounded review and recovered clarification

A PASS may carry advisory findings. Preserve them in the result, but their presence
alone does not require correction or another review round. Explicit blocking verdicts,
current evidence obligations and incoherent results still refuse progression. This is
not a severity threshold and does not silently reinterpret a negative verdict as PASS.

Recovery of a degraded preparation review permits bounded clarification, not approval.
After the admitted correction, request a fresh qualified review of the unresolved role.
Reuse other PASS results only while their contracts and relevant reviewed inputs remain
fresh. Keep the original negative result and obligations in history. Dispatch and
validation must agree on the resulting round without resetting the true budget.

## Proof sequence

First reproduce the observed incidents with behavioral RED tests. Keep refusal tests
for true exhaustion, malformed/inconsistent results, missing current evidence, stale
hashes, reused contexts and persistent failures. Fix pure mission rules first; CLI owns
validated input, journal transaction, runtime compatibility and rendering only.
Document schema compatibility and structural decisions in a new immutable-identity ADR.
An independent reviewer examines the complete correction and its evidence.

Demonstrate each real incident through an isolated supported candidate path, initially
against copied journals with provenance and immutable originals. Reconcile source CLI,
stored plan and installed role contracts explicitly. Do not claim compatibility from
version strings alone. Do not replace the installed floor, initialize/update consumers,
or publish a release. If real activation needs one of these actions, present a verified
candidate and concrete activation step separately for authorization.

After supported recovery, finish original WORK-1/2/3 corrections, tests and delivery.
Collect final results before closing owned agent panes. Preserve worktrees and proofs.
Update the checkpoint before clear; only then begin the general engine implementation.

## Inputs and ownership

Repair worktree: fix/mission-review-continuity, initially based on 1efeedf1.
Incident observations and receipts remain in the original worktrees and principal
.void/machine/handoff-2026-09-19. They are local evidence, never build inputs or fixtures
containing private conversations. Tests use minimal faithful synthetic events.
Core review tests: mission_rounds_red agent. Root owns coordination, documentation and
serialized RUN. Existing writers retain exclusive ownership of their original tickets.
