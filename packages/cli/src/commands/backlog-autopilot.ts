// `void-harness backlog-autopilot` — the deterministic planning surface for the
// attended parallel batch mode. The in-session launcher (the /harness:backlog-autopilot
// skill) gathers Linear tickets via the MCP and footprint estimates via the
// estimator subagent, pipes them here as JSON, and gets back the parallel /
// sequential plan it shows the human before invoking the Workflow.
//
// The CLI deliberately does only the deterministic computation — it has no MCP
// and spawns no agents. Cluster detection, ordering and partition are the
// unit-tested core; the launcher shows the plan (a --dry-run preview by default)
// and confirms with the human before any fan-out.

import { join } from 'node:path';
import { type AutopilotPlan, type AutopilotPlanInput, buildAutopilotPlan } from '../lib/backlog/autopilot-plan.js';
import { blockedClusters, summarizeRun } from '../lib/backlog/autopilot-run.js';
import { type MergeDecisionInput, decideMerge } from '../lib/backlog/merge-decision.js';
import { type RunState, nextPending, readState } from '../lib/backlog/run-state.js';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function printHelp(): void {
  process.stdout.write(
    `
void-harness backlog-autopilot — deterministic planning for the attended parallel mode.

This is invoked by the /harness:backlog-autopilot launcher, not usually by hand. It
reads a JSON plan input on stdin and prints the parallel/sequential plan as JSON.

Usage:
  echo '<json>' | void-harness backlog-autopilot plan
  echo '<json>' | void-harness backlog-autopilot merge-decision
  void-harness backlog-autopilot status <runId>
  void-harness backlog-autopilot resume <runId>
  void-harness backlog-autopilot explain-blocked <runId>
  void-harness backlog-autopilot abort <runId>

Operator subcommands read .void/autopilot/<runId>/state.json (status, the resume
cursor, blocked clusters + reasons). They never spawn agents; the actual resume
drives the Workflow in session.

stdin JSON:
  {
    "tickets":   [{ "id", "priority", "boardOrder", "blockedByOpen",
                    "dependsOn": [], "parentId"?, "labels"?: [] }],
    "estimates": [{ "id", "areas": [], "highRisk": false, "confidence": 0..1 }],
    "batchSize":      4,    // optional independent-leftover batch size (default 4)
    "maxClusterSize": 6,    // optional cap before a cluster is split
    "minConfidence":  0.5   // optional; below it, route sequential
  }

stdout JSON:
  {
    "clusters": [{ "id", "tickets": [], "reason", "confidence", "oversized",
                   "parallel": [], "sequential": [], "order": [] }],
    "batch":    { "parallel": [ids], "sequential": [ids] },
    "excluded": [ids]
  }
`.trimStart(),
  );
}

async function planCmd(): Promise<void> {
  const raw = await readStdin();
  let input: AutopilotPlanInput;
  try {
    input = JSON.parse(raw) as AutopilotPlanInput;
  } catch {
    process.stderr.write('backlog-autopilot plan: stdin is not valid JSON.\n');
    process.exitCode = 2;
    return;
  }
  const plan: AutopilotPlan = buildAutopilotPlan(input);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

async function mergeDecisionCmd(): Promise<void> {
  const raw = await readStdin();
  let input: MergeDecisionInput;
  try {
    input = JSON.parse(raw) as MergeDecisionInput;
  } catch {
    process.stderr.write('backlog-autopilot merge-decision: stdin is not valid JSON.\n');
    process.exitCode = 2;
    return;
  }
  // Decision only — this NEVER merges. The launcher acts on {arm} via gh.
  process.stdout.write(`${JSON.stringify(decideMerge(input), null, 2)}\n`);
}

function runDir(runId: string): string {
  return join(process.cwd(), '.void', 'autopilot', runId);
}

/** Read a run's state, or write an error and return undefined. */
function loadRun(runId: string | undefined): RunState | undefined {
  if (runId === undefined) {
    process.stderr.write('backlog-autopilot: a <runId> is required.\n');
    process.exitCode = 2;
    return undefined;
  }
  const state = readState(runDir(runId));
  if (state === undefined) {
    process.stderr.write(`backlog-autopilot: no run '${runId}' under .void/autopilot/.\n`);
    process.exitCode = 2;
    return undefined;
  }
  return state;
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function statusCmd(runId: string | undefined): void {
  const state = loadRun(runId);
  if (state !== undefined) emit({ runId: state.runId, base: state.base, ...summarizeRun(state) });
}

function explainBlockedCmd(runId: string | undefined): void {
  const state = loadRun(runId);
  if (state !== undefined) emit({ runId: state.runId, blocked: blockedClusters(state) });
}

function resumeCmd(runId: string | undefined): void {
  const state = loadRun(runId);
  if (state === undefined) return;
  // The actual resume drives the Workflow in session; the CLI reports readiness.
  const next = nextPending(state);
  emit({ runId: state.runId, base: state.base, next: next?.id ?? null, summary: summarizeRun(state) });
}

function abortCmd(runId: string | undefined): void {
  const state = loadRun(runId);
  if (state !== undefined) {
    emit({ runId: state.runId, aborted: true, note: 'state preserved for inspection; no branches deleted' });
  }
}

export async function backlogAutopilot(args: readonly string[]): Promise<void> {
  const [sub, runId] = args;
  switch (sub) {
    case 'plan':
      await planCmd();
      return;
    case 'merge-decision':
      await mergeDecisionCmd();
      return;
    case 'status':
      statusCmd(runId);
      return;
    case 'resume':
      resumeCmd(runId);
      return;
    case 'explain-blocked':
      explainBlockedCmd(runId);
      return;
    case 'abort':
      abortCmd(runId);
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      process.stderr.write(`backlog-autopilot: unknown subcommand '${sub}'\n\n`);
      printHelp();
      process.exitCode = 2;
  }
}
