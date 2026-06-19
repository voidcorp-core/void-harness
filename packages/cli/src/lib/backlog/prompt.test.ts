import { describe, expect, it } from 'vitest';
import type { BacklogConfig } from './config.js';
import { AUTONOMOUS_SETTINGS, autonomousSettings, buildClaudeArgs, renderPrompt } from './prompt.js';

const baseCfg: BacklogConfig = {
  linearScope: 'sesame',
  targetState: 'Todo',
  reviewState: 'In Review',
  branchPrefix: 'folpe/',
  maxIterations: 4,
  maxFailures: 2,
  model: undefined,
  autoMerge: false,
  allowApi: false,
  stream: true,
  dryRun: false,
  fullAuto: false,
};

describe('AUTONOMOUS_SETTINGS', () => {
  // The worker prompt's Step 1 requires the Linear MCP. acceptEdits does NOT
  // auto-approve MCP tools (only file edits), so the allowlist MUST grant the
  // Linear server explicitly or every pick phase is denied unattended.
  it('allows the Linear MCP server tools', () => {
    expect(AUTONOMOUS_SETTINGS.permissions.allow).toContain('mcp__linear__*');
  });

  // Deny-by-default safety boundary: the allowlist must never widen to all MCP
  // servers, which would let an unattended worker reach any connected server.
  it('does not allow every MCP server', () => {
    expect(AUTONOMOUS_SETTINGS.permissions.allow).not.toContain('mcp__*');
  });

  // Issue #17 cluster A (A1): the worker is commit-only. Pushing the branch and
  // opening the PR belong to the trusted orchestrator (integrate.ts), so the
  // worker must not be granted git push or gh pr at all.
  it('does NOT grant the worker git push or gh pr (orchestrator owns those)', () => {
    const allow = AUTONOMOUS_SETTINGS.permissions.allow as readonly string[];
    expect(allow).not.toContain('Bash(git push:*)');
    expect(allow).not.toContain('Bash(gh pr:*)');
    expect(allow.some((a) => a.startsWith('Bash(git push'))).toBe(false);
    expect(allow.some((a) => a.startsWith('Bash(gh pr'))).toBe(false);
  });

  // A4 (UC1): grant ONLY the narrow non-destructive history ops. cherry-pick and
  // rebase --onto graft commits without rewriting an arbitrary tree; git apply
  // (arbitrary file write, bypasses the Edit/Write protect-sensitive-files gate),
  // format-patch, and merge --no-ff were deliberately dropped.
  it('grants only the narrow non-destructive git subset (A4)', () => {
    const allow = AUTONOMOUS_SETTINGS.permissions.allow as readonly string[];
    expect(allow).toContain('Bash(git cherry-pick:*)');
    expect(allow).toContain('Bash(git rebase --onto:*)');
    expect(allow).not.toContain('Bash(git apply:*)');
    expect(allow).not.toContain('Bash(git format-patch:*)');
    expect(allow).not.toContain('Bash(git merge --no-ff:*)');
    // Never a bare `git rebase` / `git reset` / `git config`.
    expect(allow).not.toContain('Bash(git rebase:*)');
    expect(allow).not.toContain('Bash(git reset:*)');
    expect(allow).not.toContain('Bash(git config:*)');
  });

  // Two-layer cover for the push hole: the prefix-matchable dangerous push forms
  // are denied here; delete-refspec / bare-push-on-main (not prefix-matchable)
  // are caught by the block-protected-push hook.
  it('denies the prefix-matchable dangerous push + git -c forms', () => {
    const deny = AUTONOMOUS_SETTINGS.permissions.deny as readonly string[];
    expect(deny).toContain('Bash(git push --mirror:*)');
    expect(deny).toContain('Bash(git push --all:*)');
    expect(deny).toContain('Bash(git -c:*)');
    // Pre-existing destructive denies must remain.
    expect(deny).toContain('Bash(git push --force:*)');
    expect(deny).toContain('Bash(git reset --hard:*)');
  });
});

describe('autonomousSettings', () => {
  const hookPath = '/abs/core/hooks/block-protected-push.sh';
  const settings = autonomousSettings(hookPath);

  it('keeps the scoped permission allowlist', () => {
    expect(settings.permissions).toBe(AUTONOMOUS_SETTINGS.permissions);
  });

  // Issue #17 cluster A (A1): the block-protected-push net is wired into the run
  // settings as a PreToolUse Bash hook pointing at its resolved bundled path.
  it('wires block-protected-push as a PreToolUse Bash hook', () => {
    const entry = settings.hooks.PreToolUse[0];
    expect(entry?.matcher).toBe('Bash');
    expect(entry?.hooks[0]?.command).toBe(hookPath);
  });
});

describe('renderPrompt — commit-only worker (A1)', () => {
  const prompt = renderPrompt(baseCfg);

  it('creates the branch with git switch -c and the configured prefix', () => {
    expect(prompt).toContain(`git switch -c ${baseCfg.branchPrefix}`);
  });

  it('reports the branch via a VOID_EVENT: BRANCH marker', () => {
    expect(prompt).toContain('VOID_EVENT: BRANCH');
  });

  it('writes the PR description to a .pr.md file (orchestrator opens the PR)', () => {
    expect(prompt).toContain('.pr.md');
  });

  // The worker is commit-only: it must not be given an actual push/PR command,
  // though it may be TOLD it has none. Assert the framing + absence of commands.
  it('frames the worker as commit-only with no push/PR command', () => {
    expect(prompt).toContain('COMMIT-ONLY');
    expect(prompt).not.toMatch(/git push (origin|-u)/);
    expect(prompt).not.toMatch(/gh pr create/);
  });

  // A PreToolUse block (e.g. block-protected-push) is terminal for the ticket.
  it('treats a blocked git operation as terminal, no retry', () => {
    expect(prompt.toLowerCase()).toContain('do not retry');
    expect(prompt).toContain('VOID_AUTONOMOUS_RESULT: BLOCKED');
  });
});

describe('buildClaudeArgs', () => {
  it('binds the worker to the project MCP config exclusively', () => {
    const args = buildClaudeArgs('/tmp/s.json', '/repo/.mcp.json', baseCfg);
    const i = args.indexOf('--mcp-config');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('/repo/.mcp.json');
    // strict-mcp-config makes the worker ignore the developer's interactive
    // connectors (claude.ai, Gmail, ...) and see only the project's servers.
    expect(args).toContain('--strict-mcp-config');
  });

  it('still passes the headless + settings flags', () => {
    const args = buildClaudeArgs('/tmp/s.json', '/repo/.mcp.json', baseCfg);
    expect(args).toContain('-p');
    expect(args).toContain('--settings');
    expect(args[args.indexOf('--settings') + 1]).toBe('/tmp/s.json');
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
  });
});
