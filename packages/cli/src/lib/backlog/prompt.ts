// The worker iteration prompt + spawn parameters, embedded in the CLI so the
// orchestrator is self-contained (no plugin-cache path resolution). The worker
// emits machine-readable markers the parser turns into the live flux:
//   VOID_EVENT: PHASE <pick|brainstorm|plan|execute|verify|ship|compound>
//   VOID_EVENT: DECISION <one line>
//   VOID_EVENT: PR <ref>
//   VOID_AUTONOMOUS_RESULT: <COMPLETED|BLOCKED|NO_TICKETS> [ticket] [detail]

import type { BacklogConfig } from './config.js';

/**
 * Scoped permission profile for an unattended worker: pre-allow the safe
 * commands, deny the irreversible ones. This deny-by-default allowlist is the
 * real safety boundary (the security hooks are guardrails on top). Tune `allow`
 * to the project's toolchain; never widen `deny`.
 */
export const AUTONOMOUS_SETTINGS = {
  permissions: {
    allow: [
      'Read',
      'Edit',
      'Write',
      'Glob',
      'Grep',
      'Skill',
      // Step 1 of the worker prompt requires the Linear MCP. acceptEdits does
      // NOT auto-approve MCP tools (only file edits), so the pick phase is
      // denied unattended without this. Scoped to the project's "linear"
      // server only (see hasLinearMcpServer) — never widen to `mcp__*`, which
      // would expose every connected server to an unattended worker.
      'mcp__linear__*',
      'Bash(pnpm:*)',
      'Bash(npm:*)',
      'Bash(bun:*)',
      'Bash(node:*)',
      'Bash(npx:*)',
      'Bash(git status:*)',
      'Bash(git diff:*)',
      'Bash(git log:*)',
      'Bash(git add:*)',
      'Bash(git commit:*)',
      'Bash(git checkout:*)',
      'Bash(git switch:*)',
      'Bash(git branch:*)',
      // No `git push` / `gh pr`: the worker is commit-only. Pushing the branch
      // and opening the PR belong to the TRUSTED orchestrator (see integrate.ts).
      // An agent with arbitrary code execution can bypass a string-matching push
      // hook (node -e "git push ..."), so the capability is removed, not gated.
      // (Issue #17 cluster A, A1.)
      'Bash(git pull:*)',
      'Bash(git fetch:*)',
      'Bash(git restore:*)',
      'Bash(gh issue:*)',
      'Bash(gh run:*)',
      'Bash(ls:*)',
      'Bash(cat:*)',
      'Bash(rg:*)',
      'Bash(find:*)',
      'Bash(mkdir:*)',
    ],
    deny: [
      'Bash(git push --force:*)',
      'Bash(git push -f:*)',
      'Bash(git reset --hard:*)',
      'Bash(rm -rf /:*)',
      'Bash(rm -rf ~:*)',
      'Read(./.env)',
      'Read(./.env.*)',
      'Read(./**/*.pem)',
      'Edit(./.env)',
      'Edit(./.env.*)',
    ],
  },
} as const;

/**
 * Build the run settings written to disk for a worker session: the scoped
 * permission allowlist plus the `block-protected-push` PreToolUse net wired to
 * its resolved path. The hook is a SECONDARY defense (the worker has no
 * `git push`); it backstops a regression, it is not the A1 boundary.
 */
export function autonomousSettings(blockProtectedPushHook: string) {
  return {
    permissions: AUTONOMOUS_SETTINGS.permissions,
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: blockProtectedPushHook }],
        },
      ],
    },
  } as const;
}

/**
 * Claude Code args for one headless worker session. `mcpConfigPath` points at
 * the project's `.mcp.json`; `--strict-mcp-config` makes the worker use ONLY
 * those servers, ignoring the developer's interactive connectors (claude.ai,
 * Gmail, ...) that are absent or unauthorized in a headless process anyway.
 */
export function buildClaudeArgs(
  settingsPath: string,
  mcpConfigPath: string,
  cfg: BacklogConfig,
): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--settings',
    settingsPath,
    '--mcp-config',
    mcpConfigPath,
    '--strict-mcp-config',
  ];
  if (cfg.model !== undefined) args.push('--model', cfg.model);
  if (cfg.fullAuto) args.push('--dangerously-skip-permissions');
  return args;
}

/** The single-ticket worker prompt, parameterised by the run config. */
export function renderPrompt(cfg: BacklogConfig): string {
  const autoMerge = cfg.autoMerge ? '1' : '0';
  return `You are ONE iteration of an autonomous backlog loop. You have a FRESH context and
will handle exactly ONE Linear ticket end to end, then exit. Keep durable state
in Linear and in on-disk plan files; assume no memory from a previous ticket.

Emit these machine-readable markers on their own line as you progress (the
orchestrator renders them as the live flux and the final summary):
- \`VOID_EVENT: PHASE <pick|brainstorm|plan|execute|verify|ship|compound>\` when you enter that phase.
- \`VOID_EVENT: DECISION <one line>\` for each structural decision (with the rejected alternative).
- \`VOID_EVENT: PR <number-or-url>\` right after you open the pull request.
End with exactly one \`VOID_AUTONOMOUS_RESULT:\` line (see below).

Invoke the relevant void skills (installed): brainstorming, source-driven-development,
adr-workflow, writing-plans, tdd, verification-before-completion, commit-discipline,
compounding, context-management. Let the PreToolUse hooks gate you; do not work around them.

## Step 1 — Pick (emit \`VOID_EVENT: PHASE pick\`)
Using the Linear MCP, find eligible tickets in: ${cfg.linearScope}, in state
"${cfg.targetState}". Eligible = NOT blocked by any still-open ticket. Pick the SINGLE
most important one: explicit priority, then board order, then dependency order.
- No eligible ticket → output exactly \`VOID_AUTONOMOUS_RESULT: NO_TICKETS\` and stop.
- Ambiguous / missing acceptance criteria → add a Linear comment asking for them, move
  the ticket out of "${cfg.targetState}" (label \`needs-criteria\`), output
  \`VOID_AUTONOMOUS_RESULT: BLOCKED <ticket-id> missing acceptance criteria\` and stop.
Otherwise move the ticket to "In Progress" and create branch \`${cfg.branchPrefix}<ticket-id>\`.

## Step 2 — Don't assume it is unimplemented
Search the codebase first; build on what exists, never duplicate.

## Step 3 — Brainstorm and decide (emit \`VOID_EVENT: PHASE brainstorm\`)
Turn the description + acceptance criteria into a concrete spec. The acceptance criteria
ARE the approved scope; do not expand. Ground third-party choices in official docs. Record
an ADR for any structural decision with a credible rejected alternative, and emit a
\`VOID_EVENT: DECISION\` line for it.

## Step 4 — Plan (emit \`VOID_EVENT: PHASE plan\`)
Write the executable plan to \`.void/autonomous-runs/<ticket-id>.plan.md\` (durable disk state).

## Step 5 — Execute (emit \`VOID_EVENT: PHASE execute\`)
Implement test-first (tdd). Stay in scope. Atomic commits with "why" (commit-discipline).

## Step 6 — Verify (emit \`VOID_EVENT: PHASE verify\`)
Run the project checks (tests, typecheck, lint, build). Tests are the only judge. If you
cannot get green after a genuine effort, do NOT fake completion: post the failure evidence
as a Linear comment, move the ticket to blocked, push your WIP branch, and output
\`VOID_AUTONOMOUS_RESULT: BLOCKED <ticket-id> verification red: <one-line reason>\` then stop.

## Step 7 — Ship (emit \`VOID_EVENT: PHASE ship\`)
Open a PR (never push --force, never edit secrets or lockfiles by hand). Emit
\`VOID_EVENT: PR <number-or-url>\`. Then:
- If AUTO_MERGE is "${autoMerge}" and equals 1: wait for CI green, merge, move the ticket to "Done".
  If CI is red, treat as Step 6 failure (BLOCKED).
- Otherwise: leave the PR open and move the ticket to "${cfg.reviewState}". The human owns the merge.

## Step 8 — Compound (emit \`VOID_EVENT: PHASE compound\`)
If this ticket taught a reusable pattern, route it (capture-rule / .void/harness-feedback/proposed/).
Non-blocking, HITL — propose, never auto-apply.

## Step 9 — Report
Output exactly one final line: \`VOID_AUTONOMOUS_RESULT: COMPLETED <ticket-id>\`
`;
}
