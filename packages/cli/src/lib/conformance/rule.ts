// The conformance rule contract.
//
// A rule declares how to DETECT drift and, when the fix is mechanical, how to
// REPAIR it. The admission test decides which rules may carry a repair:
//
//   would two competent people agree on the exact repair, without discussing it?
//
// Layout, formats, ignore blocks, wiring, naming — yes. A violated boundary, a
// weak test, an abstraction too many — never; those stay with `doctrine-critic`,
// which proposes and does not correct.
//
// That boundary does double duty. A repair that arbitrates is a repair that
// corrupts someone else's project, and the same line is what stops this from
// growing into an endless command.
//
// Pure. Rules do the I/O; this sequences them and decides what may be applied.

export interface ConformanceFinding {
  readonly drifted: boolean;
  readonly detail?: string;
}

/** One file the repair would write. Applied as a single transaction per rule. */
export interface Mutation {
  /** Project-relative. */
  readonly path: string;
  readonly contents: string;
}

export interface RepairPlan {
  readonly mutations: readonly Mutation[];
}

export interface RuleContext {
  readonly root: string;
  /**
   * Whether the working tree carries uncommitted changes. A repair must stay
   * readable as a diff and undoable with a checkout; on a dirty tree it becomes
   * indistinguishable from what was already there.
   */
  readonly treeDirty: boolean;
}

export interface ConformanceRule {
  readonly id: string;
  readonly title: string;
  readonly detect: (context: RuleContext) => ConformanceFinding;
  /** Absent means advisory: reported, never applied. */
  readonly repair?: (context: RuleContext) => RepairPlan;
}

export interface Finding {
  readonly ruleId: string;
  readonly title: string;
  readonly detail: string;
  /** True when this rule could repair itself, before the dirty-tree guard. */
  readonly hasRepair: boolean;
}

export interface ConformancePlan {
  readonly findings: readonly Finding[];
  /** Rule ids `--fix` may apply. Empty when something blocks all repairs. */
  readonly repairable: readonly string[];
  /** Why no repair is offered, when that is the case. */
  readonly blocked?: string;
}

const DIRTY_TREE =
  'the working tree has uncommitted changes; a repair must stay readable as a diff '
  + 'and undoable with a checkout, which it cannot be here. Commit or stash first.';

/**
 * Run every rule and decide what may be applied.
 *
 * A rule that throws becomes a finding rather than taking the sweep down: eight
 * projects and a dozen rules answer at once, and one broken detector must cost
 * its own answer only. Such a rule never offers a repair — a detector that could
 * not read the project has no business writing to it.
 */
export function planRepairs(
  rules: readonly ConformanceRule[],
  context: RuleContext,
): ConformancePlan {
  const findings: Finding[] = [];
  const repairable: string[] = [];

  for (const rule of rules) {
    let finding: ConformanceFinding;
    try {
      finding = rule.detect(context);
    } catch (error) {
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        detail: `detection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        hasRepair: false,
      });
      continue;
    }

    if (!finding.drifted) continue;

    const hasRepair = rule.repair !== undefined;
    findings.push({
      ruleId: rule.id,
      title: rule.title,
      detail: finding.detail ?? 'drifted',
      hasRepair,
    });
    if (hasRepair && !context.treeDirty) repairable.push(rule.id);
  }

  const blockedByTree = context.treeDirty && findings.some((finding) => finding.hasRepair);
  return {
    findings,
    repairable,
    ...(blockedByTree ? { blocked: DIRTY_TREE } : {}),
  };
}
