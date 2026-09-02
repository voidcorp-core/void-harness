// What a unit owes before its range may merge, and how that is judged.
//
// The missing piece the spec identified: the machinery to seal evidence existed
// and nothing declared what a unit was expected to produce, so a skipped pass
// left no trace -- there was never an expectation to violate.
//
// Two rules make this worth having, and both were found by review rather than by
// design. Sealing an argv does not constrain it: `mission verify -- <command...>`
// runs whatever the caller names, so a worker asking for the suite on one file
// produces evidence that is sealed, fresh, correctly bound and worthless. And
// absence used to conflate a red suite with a run nobody performed, which would
// end a six-hour run on the first flaky crash.

import { autopilotFailure } from './errors.js';

export type ProofId = 'suite-green' | 'panel-before-writing' | 'red-before-green' | 'surface-run';

/**
 * Absolute proofs refuse; escalating ones become debt.
 *
 * A green suite accepted as debt is broken code on the base. A deploy surface
 * that genuinely cannot run here, declared as debt, is honest reporting. The
 * distinction is the design, not a severity dial.
 */
export type ProofClass = 'absolute' | 'escalating';

export interface RequiredProof {
  readonly id: ProofId;
  readonly proofClass: ProofClass;
  /** The exact invocation that satisfies it, from `autopilot.verifyCommands`. */
  readonly command: readonly string[];
}

/** The subset of sealed evidence this judgement reads. */
export interface ProofEvidence {
  readonly evidenceId: string;
  readonly command: readonly string[];
  readonly diffHash: string;
  readonly status: 'passed' | 'failed';
  readonly exitCode: number;
}

/** Why nobody proved it — three causes that used to read alike. */
export type UnprovenReason = 'absent' | 'command-mismatch' | 'stale-tree';

export type ProofOutcome =
  | { readonly kind: 'satisfied'; readonly evidenceId: string }
  | { readonly kind: 'refuted'; readonly evidenceId: string; readonly detail: string }
  | { readonly kind: 'unproven'; readonly reason: UnprovenReason; readonly detail: string };

export interface DebtRecord {
  readonly proof: ProofId;
  readonly severity: 'low' | 'medium' | 'high';
  readonly reason: string;
}

/** What the chain does next, in the vocabulary the typed actions already use. */
export type ProofAction = 'STOP_CHAIN' | 'RETRY_MODIFIED';

export type RangeVerdict =
  | { readonly kind: 'merge'; readonly debts: readonly DebtRecord[] }
  | {
      readonly kind: 'refuse';
      readonly action: ProofAction;
      readonly detail: string;
      readonly debts: readonly DebtRecord[];
    };

const DEBT_SEVERITY: Readonly<Record<ProofId, DebtRecord['severity']>> = Object.freeze({
  'suite-green': 'high',
  'panel-before-writing': 'high',
  'red-before-green': 'medium',
  'surface-run': 'medium',
});

function invalid(detail: string): never {
  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    'a required proof is not usable as declared',
    detail,
    'declare each proof with the exact command from `autopilot.verifyCommands`',
  );
}

const render = (command: readonly string[]): string => command.join(' ');

function sameCommand(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

/**
 * Judge one proof against the evidence that exists for the tree being merged.
 *
 * The order matters. A command mismatch is reported before a stale tree, because
 * a worker who narrowed the suite gets told what was expected rather than sent
 * to look at a hash. And `refuted` is reserved for the declared command actually
 * running and failing: everything else is nobody having proved it, which is a
 * different fact and leads to a different action.
 */
export function judgeProof(
  proof: RequiredProof,
  evidence: readonly ProofEvidence[],
  mergedTreeHash: string,
): ProofOutcome {
  if (proof.command.length === 0) invalid(`\`${proof.id}\` declares an empty command`);

  const forCommand = evidence.filter((item) => sameCommand(item.command, proof.command));
  if (forCommand.length === 0) {
    const seen = evidence.map((item) => `\`${render(item.command)}\``).join(', ');
    return evidence.length === 0
      ? {
          kind: 'unproven',
          reason: 'absent',
          detail: `nothing was sealed for \`${render(proof.command)}\``,
        }
      : {
          kind: 'unproven',
          reason: 'command-mismatch',
          detail: `\`${render(proof.command)}\` was owed; what ran was ${seen}`,
        };
  }

  const onTree = forCommand.filter((item) => item.diffHash === mergedTreeHash);
  if (onTree.length === 0) {
    return {
      kind: 'unproven',
      reason: 'stale-tree',
      detail: `\`${render(proof.command)}\` ran, but against a tree that is not the one merging`,
    };
  }

  const failed = onTree.find((item) => item.status === 'failed');
  if (failed !== undefined) {
    return {
      kind: 'refuted',
      evidenceId: failed.evidenceId,
      detail: `\`${render(proof.command)}\` failed with exit ${String(failed.exitCode)}`,
    };
  }
  return { kind: 'satisfied', evidenceId: onTree[0]?.evidenceId ?? '' };
}

/**
 * Decide whether a range may merge, and what the chain does when it may not.
 *
 * A refuted absolute proof stops the chain: the suite genuinely ran and failed,
 * and merging the next unit onto a red base is how one bad merge becomes ten. An
 * unproven one is a retry, because nobody having run it is not the same fact and
 * a flaky runner must not end the run.
 */
export function judgeRangeProofs(
  required: readonly RequiredProof[],
  evidence: readonly ProofEvidence[],
  mergedTreeHash: string,
): RangeVerdict {
  if (required.length === 0) {
    // Owing nothing is a misconfiguration, not a clean unit. Passing by vacuity
    // is how a gate becomes decorative.
    return {
      kind: 'refuse',
      action: 'RETRY_MODIFIED',
      detail: 'this unit declares no required proof; declare what it owes before merging it',
      debts: [],
    };
  }

  const debts: DebtRecord[] = [];
  let refusal: { readonly action: ProofAction; readonly detail: string } | undefined;

  for (const proof of required) {
    const outcome = judgeProof(proof, evidence, mergedTreeHash);
    if (outcome.kind === 'satisfied') continue;

    if (proof.proofClass === 'escalating') {
      debts.push({
        proof: proof.id,
        severity: DEBT_SEVERITY[proof.id],
        reason: outcome.detail,
      });
      continue;
    }

    // A red suite outranks a missing one: reporting the absence would send
    // somebody to re-run a thing that already told us the answer.
    const action: ProofAction = outcome.kind === 'refuted' ? 'STOP_CHAIN' : 'RETRY_MODIFIED';
    if (refusal === undefined || action === 'STOP_CHAIN') {
      refusal = { action, detail: `${proof.id}: ${outcome.detail}` };
    }
  }

  return refusal === undefined
    ? { kind: 'merge', debts: Object.freeze([...debts]) }
    : { kind: 'refuse', action: refusal.action, detail: refusal.detail, debts: Object.freeze([...debts]) };
}
