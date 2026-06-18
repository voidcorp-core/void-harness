// Preflight predicate for the backlog loop's Linear dependency.
//
// The worker reaches Linear through a project-level `.mcp.json` server keyed
// "linear" (the harness convention) authenticated by a token in the env, never
// the developer's interactive claude.ai connector (absent in a headless
// process). This pure check lets the command fail loud before spawning a worker
// that could never pick a ticket. I/O (reading the file) stays in the command.

/** True iff the raw `.mcp.json` text declares a server keyed "linear". */
export function hasLinearMcpServer(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  try {
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    return parsed.mcpServers?.linear !== undefined;
  } catch {
    return false;
  }
}
