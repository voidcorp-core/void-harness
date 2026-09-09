// What a run owes as it goes, and what it tells a person when it stops.
//
// Two findings from the review that refused to clear the plan, and both are
// about a six-hour run rather than about a correct one.
//
// Debt travels so the next unit does not rediscover what an earlier one already
// paid for -- but unit N's brief carrying N-1 units of debt is quadratic growth
// on the hottest path of a long run, so it is bounded and says what it dropped.
//
// And a stop says what was KEPT. `stop (post-merge-red)` at hour six does not
// tell anybody whether relaunching redoes four merged tickets or resumes past
// them. The code has always resumed; nothing ever said so, and that unstated
// sentence is the difference between relaunching and hand-driving.

import type { DebtRecord } from './required-proof.js';

export interface CarriedDebt extends DebtRecord {
  /** The unit that incurred it, so a reader can open the right range. */
  readonly unit: string;
}

/** Past this a brief is carrying more history than work. */
const CARRY_MAX = 8;

const RANK: Readonly<Record<CarriedDebt['severity'], number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

/**
 * What the next unit is told about what earlier ones owe.
 *
 * Sorted by severity rather than by recency: a reader acts on the worst thing
 * outstanding, and the newest low-severity note is the least of them. Dropping
 * is named rather than silent, on the same rule the context pack follows -- a
 * silent cap reads as full coverage.
 */
export function carryDebt(
  debts: readonly CarriedDebt[],
  options?: { readonly withNote?: boolean },
): readonly CarriedDebt[] {
  // Not `Array.isArray`: it narrows a `readonly T[]` to `any[]` and silently
  // takes the element type with it, which is how the severity index below lost
  // its type. The length check is the same runtime guard without that cost.
  if (debts === undefined || debts.length === 0) return Object.freeze([]);

  const ordered = [...debts].sort((left, right) => RANK[left.severity] - RANK[right.severity]);
  const kept = ordered.slice(0, CARRY_MAX);
  const dropped = ordered.length - kept.length;

  if (dropped > 0 && options?.withNote === true) {
    const last = kept[kept.length - 1];
    if (last !== undefined) {
      kept[kept.length - 1] = {
        ...last,
        reason: `${last.reason} (and ${String(dropped)} more, lower severity, in the run journal)`,
      };
    }
  }
  return Object.freeze(kept);
}

export interface Disposition {
  readonly merged: readonly string[];
  /** Published and handed to a person; not remaining, and not kept either. */
  readonly awaitingHuman: readonly string[];
  /** Taken and handed back without a range to integrate. */
  readonly blocked: readonly string[];
  readonly remaining: readonly string[];
  readonly debts: readonly CarriedDebt[];
}

/**
 * The sentence a stop owes a person who is not at a terminal.
 *
 * Every stop in this chain preserves its work -- leases, branches, commits and
 * the cursor stay exactly where they are. That is true in the code and was said
 * nowhere a reader would meet it.
 *
 * A unit waiting for a person is named on its own, never among the ready ones:
 * "still ready: DEV-703" is the sentence that sent a relaunch back onto an open
 * pull request on 2026-09-02.
 */
export function renderDisposition(disposition: Disposition): string {
  const merged = disposition.merged.length;
  const remaining = disposition.remaining.length;

  const kept = merged === 0
    ? 'nothing merged yet, so no unit is at risk'
    : `${String(merged)} unit(s) merged and kept: ${disposition.merged.join(', ')}`;

  const waiting = disposition.awaitingHuman.length === 0
    ? []
    : [`${String(disposition.awaitingHuman.length)} waiting for a person:`
      + ` ${disposition.awaitingHuman.join(', ')}`];

  const blocked = disposition.blocked.length === 0
    ? []
    : [`${String(disposition.blocked.length)} blocked: ${disposition.blocked.join(', ')}`];

  const left = remaining === 0
    ? 'nothing is still ready'
    : `${String(remaining)} still ready: ${disposition.remaining.join(', ')}`;

  const owed = disposition.debts.length === 0
    ? ''
    : `\nowed: ${disposition.debts
        .map((debt) => `${debt.proof} (${debt.severity}, ${debt.unit})`)
        .join('; ')}`;

  const account = [kept, ...waiting, ...blocked, left].join('; ');
  return `${account}. Relaunching resumes and loses nothing.${owed}`;
}
