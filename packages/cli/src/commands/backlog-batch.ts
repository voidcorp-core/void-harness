// `void-harness backlog-batch` — the deterministic planning surface for the
// attended parallel batch mode. The in-session launcher (the /harness:backlog-batch
// skill) gathers Linear tickets via the MCP and footprint estimates via the
// estimator subagent, pipes them here as JSON, and gets back the parallel /
// sequential plan it shows the human before invoking the Workflow.
//
// The CLI deliberately does only the deterministic computation — it has no MCP
// and spawns no agents. Selection + partition are the unit-tested core.

import { type BatchPlan, type PlanInput, buildPlan } from '../lib/backlog/batch-plan.js';

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
void-harness backlog-batch — deterministic planning for the attended parallel mode.

This is invoked by the /harness:backlog-batch launcher, not usually by hand. It
reads a JSON plan input on stdin and prints the parallel/sequential plan as JSON.

Usage:
  echo '<json>' | void-harness backlog-batch plan

stdin JSON:
  {
    "tickets":   [{ "id", "priority", "boardOrder", "blockedByOpen", "dependsOn": [] }],
    "estimates": [{ "id", "areas": [], "highRisk": false, "confidence": 0..1 }],
    "k":             3,     // optional batch size (default 3)
    "minConfidence": 0.5    // optional; below it, route sequential
  }

stdout JSON:
  { "parallel": [ids], "sequential": [ids], "excluded": [ids] }
`.trimStart(),
  );
}

async function planCmd(): Promise<void> {
  const raw = await readStdin();
  let input: PlanInput;
  try {
    input = JSON.parse(raw) as PlanInput;
  } catch {
    process.stderr.write('backlog-batch plan: stdin is not valid JSON.\n');
    process.exitCode = 2;
    return;
  }
  const plan: BatchPlan = buildPlan(input);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

export async function backlogBatch(args: readonly string[]): Promise<void> {
  const [sub] = args;
  switch (sub) {
    case 'plan':
      await planCmd();
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      process.stderr.write(`backlog-batch: unknown subcommand '${sub}'\n\n`);
      printHelp();
      process.exitCode = 2;
  }
}
