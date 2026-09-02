// One decision, composing the three chain functions that had no caller.
//
// `parseChainBudget`, `resolveChainBudget`, `planChainStep` and
// `renderMergeJournal` were written and tested on 2026-08-27 and nothing ever
// called them, so `mode autopilot 6h` existed as a design and not as a command.
// This is the composition; the loop that acts on it belongs to the skill,
// because the CLI contacts nothing and spawns no agent.

import { carryDebt, renderDisposition, type CarriedDebt } from './debt-carry.js';
import {
  planChainStep,
  renderMergeJournal,
  resolveChainBudget,
  type ChainDecision,
  type MergedUnit,
  type PostMergeObservation,
  type TakenOutcome,
  type TakenUnit,
} from './chain.js';
import { autopilotFailure } from './errors.js';

export interface ChainObservation {
  readonly schemaVersion: 1;
  /** Everything merged so far in this run, oldest first. */
  readonly merged: readonly MergedUnit[];
  /**
   * Every unit this run took, oldest first, with where it ended up.
   *
   * `merged` above is the evidence a merge rested on; this is the account of
   * what was taken, and the two are cross-checked rather than trusted: a merged
   * unit missing here, or a unit claimed merged here without its evidence
   * there, is a contradiction in the description and refuses the step.
   */
  readonly taken: readonly TakenUnit[];
  /** How long the run has been going. */
  readonly elapsedMs: number;
  /** The base after the most recent merge; absent is not "fine". */
  readonly postMerge: PostMergeObservation | undefined;
  /** The ordered pool this run may take from, including what it already took. */
  readonly pool: readonly string[];
  /** A duration this one run asks for, e.g. `6h`. */
  readonly requested?: string | undefined;
  /** What earlier units of this run owe, carried forward and reported. */
  readonly debts?: readonly CarriedDebt[] | undefined;
}

export interface ChainProgram {
  readonly chainBudgetMs: number;
  readonly chainBudgetDeclared: boolean;
}

export interface ChainStep {
  readonly budgetMs: number;
  readonly decision: ChainDecision;
  /** The unit to take now. Absent whenever the decision is to stop. */
  readonly nextUnit?: string;
  /** What merged so far, rendered for the pull request body. */
  readonly journal: string;
  /**
   * What is kept and what remains, in one sentence.
   *
   * Present on a continue as well as on a stop: a person watching a long run
   * should not meet a different surface depending on whether it ended.
   */
  readonly disposition: string;
  /** Bounded, severity-ordered, for the next unit's brief. */
  readonly carriedDebts: readonly CarriedDebt[];
}

export function decideChainStep(
  observation: ChainObservation,
  program: ChainProgram,
): ChainStep {
  const budgetMs = resolveChainBudget({
    declaredMs: program.chainBudgetMs,
    declared: program.chainBudgetDeclared,
    requested: observation.requested,
  });

  refuseDisagreement(observation.merged, observation.taken);

  // Taken is taken, whatever became of it. `pool - merged` was the reading that
  // proposed DEV-703 again on 2026-09-02, published and waiting for a person,
  // to a caller that would have started a second worker on it.
  const taken = new Set(observation.taken.flatMap((unit) => unit.tickets));
  const remaining = observation.pool.filter((id) => !taken.has(id));

  const decision = planChainStep({
    merged: observation.merged,
    taken: observation.taken,
    budgetMs,
    elapsedMs: observation.elapsedMs,
    postMerge: observation.postMerge,
    nextReady: remaining.length,
  });

  // A stop names no unit. Returning one "for later" is how a caller takes it
  // anyway, and the whole point of the stop reasons is that a red base or a
  // spent budget ends the run rather than pausing it.
  const nextUnit = decision.kind === 'continue' ? remaining[0] : undefined;

  const debts = carryDebt(observation.debts ?? [], { withNote: true });

  return {
    budgetMs,
    decision,
    ...(nextUnit === undefined ? {} : { nextUnit }),
    journal: renderMergeJournal(observation.merged),
    disposition: renderDisposition({
      merged: observation.merged.flatMap((merged) => merged.tickets),
      awaitingHuman: ticketsWith(observation.taken, 'published-awaiting-human'),
      blocked: ticketsWith(observation.taken, 'unit-blocked'),
      remaining,
      debts,
    }),
    carriedDebts: debts,
  };
}

function ticketsWith(taken: readonly TakenUnit[], outcome: TakenOutcome): readonly string[] {
  return taken.filter((unit) => unit.outcome === outcome).flatMap((unit) => unit.tickets);
}

/**
 * The merge journal and the taken list must name the same merged tickets.
 *
 * The same rule `reconcile` applies to `cluster` and `footprints`: two lists in
 * one description that disagree are not "one of them is right", they are a
 * description nobody checked. Trusting `taken` alone would let a caller drop a
 * merged unit from it and have it proposed again; trusting `merged` alone is
 * the defect this replaces.
 */
function refuseDisagreement(
  merged: readonly MergedUnit[],
  taken: readonly TakenUnit[],
): void {
  const journal = new Set(merged.flatMap((unit) => unit.tickets));
  const claimed = new Set(ticketsWith(taken, 'merged'));
  const missing = [...journal].filter((id) => !claimed.has(id));
  const unbacked = [...claimed].filter((id) => !journal.has(id));
  if (missing.length === 0 && unbacked.length === 0) return;
  throw autopilotFailure(
    'AUTOPILOT_INPUT',
    'the chain observation disagrees with itself about what merged',
    missing.length > 0
      ? `\`merged\` names ${missing.join(', ')} and \`taken\` does not list it as merged`
      : `\`taken\` claims ${unbacked.join(', ')} merged and \`merged\` carries no evidence for it`,
    'list every unit this run took in `taken`, with `merged` for exactly the ones in `merged`',
  );
}
