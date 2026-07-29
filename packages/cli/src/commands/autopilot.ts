// `void-harness autopilot` — the deterministic planning surface of the autopilot
// bounded context. NOT yet wired into main.ts: range A builds the destination,
// range D moves the public surface onto it, so no release ever ships two engines.
//
// Functional core, imperative shell: `runAutopilotCommand` is a pure function of
// (argv, stdin) and returns what to print and with which exit code. The CLI
// itself contacts nothing — no tracker, no git, no agent. The skill hydrates the
// observation, pipes it in, and applies whatever the plan says.

import {
  type ClusterPlan,
  type ClusterPlanInput,
  planCluster,
} from '../lib/autopilot/cluster-plan.js';
import { autopilotFailure, renderAutopilotFailure, toAutopilotFailure } from '../lib/autopilot/errors.js';

export interface AutopilotCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: 0 | 2;
}

const USAGE = `
void-harness autopilot — deterministic planning for the attended cluster mode.

Invoked by the /harness:autopilot skill, which hydrates the observation from the
tracker and pipes it in. The CLI computes; it never contacts Linear, GitHub or
git, and it spawns no agent.

Usage:
  echo '<CandidateObservation>' | void-harness autopilot plan [--json]

stdin JSON (CandidateObservation):
  {
    "schemaVersion": 1,
    "tickets":    [{ "id", "ready", "priority", "boardOrder", "blockedByOpen",
                     "dependsOn": [], "estimate": number | null }],
    "footprints": [{ "id", "areas": [], "highRisk": false, "confidence": 0..1 }],
    "clusterSize":   4,    // optional ceiling, 1..4 (default 4)
    "minConfidence": 0.5   // optional; below it a footprint is doubtful
  }

stdout JSON (--json): the ClusterPlan — cluster, parallel, sequential with
reasons, excluded with typed causes, and the review budget.

Merging is a human gate: there is no --auto-merge.
`.trimStart();

function ok(stdout: string): AutopilotCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr: string): AutopilotCommandResult {
  return { stdout: '', stderr, exitCode: 2 };
}

function renderHuman(plan: ClusterPlan): string {
  const lines: string[] = [];
  lines.push(`cluster (${plan.cluster.length}): ${plan.cluster.join(', ') || 'none'}`);
  lines.push(`  parallel:   ${plan.parallel.join(', ') || 'none'}`);
  lines.push(
    `  sequential: ${
      plan.sequential.map((t) => `${t.id} (${t.reasons.join(', ')})`).join(', ') || 'none'
    }`,
  );

  const budget = plan.reviewBudget;
  lines.push(
    `review budget: ${budget.spent}/${budget.capacity} units, tracker estimate ${budget.totalEstimate} point(s)${
      budget.unestimated.length > 0 ? ` (unestimated: ${budget.unestimated.join(', ')})` : ''
    }`,
  );

  if (plan.excluded.length > 0) {
    lines.push('excluded:');
    for (const excluded of plan.excluded) lines.push(`  ${excluded.id}: ${excluded.cause}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseObservation(stdin: string): ClusterPlanInput {
  try {
    return JSON.parse(stdin) as ClusterPlanInput;
  } catch (error) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      'the candidate observation on stdin is not valid JSON',
      error instanceof Error ? error.message : String(error),
      'pipe the observation the skill produced, unmodified, into `autopilot plan`',
    );
  }
}

/**
 * Pure command entry point: same argv and stdin always produce the same result,
 * which is what makes the CLI contract testable without a process.
 */
export function runAutopilotCommand(argv: readonly string[], stdin: string): AutopilotCommandResult {
  const json = argv.includes('--json');

  try {
    if (argv.includes('--auto-merge')) {
      // Refused on every path, not just this one: the merge gate is the human
      // contract of the whole feature, so the flag must never quietly appear.
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        'autopilot does not accept --auto-merge',
        'merging the integration PR is a human gate of the autopilot contract',
        'drop --auto-merge and merge the PR yourself once its checks are green',
      );
    }
    if (argv.includes('--help') || argv.includes('-h')) return ok(USAGE);

    const [subcommand] = argv.filter((arg) => !arg.startsWith('-'));
    if (subcommand === undefined) {
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        'autopilot was invoked without a subcommand',
        'the command cannot infer what you meant to plan',
        'run `void-harness autopilot plan` with the observation on stdin, or --help',
      );
    }
    if (subcommand !== 'plan') {
      throw autopilotFailure(
        'AUTOPILOT_USAGE',
        `autopilot has no '${subcommand}' subcommand`,
        'only `plan` exists at this stage of the cutover',
        'run `void-harness autopilot plan`, or --help for the full contract',
      );
    }

    const plan = planCluster(parseObservation(stdin));
    return ok(json ? `${JSON.stringify(plan, null, 2)}\n` : renderHuman(plan));
  } catch (error) {
    return fail(renderAutopilotFailure(toAutopilotFailure(error), json));
  }
}
