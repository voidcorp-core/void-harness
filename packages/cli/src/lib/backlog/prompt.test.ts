import { describe, expect, it } from 'vitest';
import type { BacklogConfig } from './config.js';
import { AUTONOMOUS_SETTINGS, buildClaudeArgs } from './prompt.js';

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
