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
} from './chain.js';

export interface ChainObservation {
  readonly schemaVersion: 1;
  /** Everything merged so far in this run, oldest first. */
  readonly merged: readonly MergedUnit[];
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

  const taken = new Set(observation.merged.flatMap((unit) => unit.tickets));
  const remaining = observation.pool.filter((id) => !taken.has(id));

  const decision = planChainStep({
    merged: observation.merged,
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
      remaining,
      debts,
    }),
    carriedDebts: debts,
  };
}
