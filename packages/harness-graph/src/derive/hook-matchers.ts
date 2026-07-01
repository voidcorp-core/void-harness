import type { NodeTriggers } from '../model/types.js';

// Reads the Claude plugin manifest's `hooks` wiring and derives, per hook, the
// tools its matcher routes on. The matcher encodes ONLY the tool (e.g.
// "Edit|Write", "Bash"); path/glob scoping lives imperatively in the .sh body
// and is not recoverable here. A "*" matcher (fires on every tool) and a group
// with no matcher (e.g. SessionStart, fires every session) are broad/always and
// therefore not assessable for dead-hook — they are skipped.

interface HookEntry {
  readonly command?: unknown;
}
interface MatcherGroup {
  readonly matcher?: unknown;
  readonly hooks?: readonly HookEntry[];
}

/** `${CLAUDE_PLUGIN_ROOT}/hooks/tdd-guard.sh` -> `tdd-guard`. */
function hookName(command: string): string | undefined {
  const m = command.match(/([^/\\]+)\.sh$/);
  return m?.[1];
}

function toolsFromMatcher(matcher: string): string[] {
  return matcher
    .split('|')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Map hook basename -> derived triggers (tools only). Pure and tolerant:
 * malformed input yields an empty map, never throws (the build must not crash).
 * Only hooks with a specific tool matcher appear; "*" and matcher-less groups
 * are omitted so the dead-hook analysis never flags an always-firing hook.
 */
export function parseHookMatchers(pluginJsonText: string): Map<string, NodeTriggers> {
  const out = new Map<string, string[]>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(pluginJsonText);
  } catch {
    return new Map();
  }
  const hooks = (parsed as { hooks?: Record<string, unknown> } | null)?.hooks;
  if (typeof hooks !== 'object' || hooks === null) return new Map();

  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups as MatcherGroup[]) {
      const matcher = group?.matcher;
      if (typeof matcher !== 'string' || matcher === '*') continue; // broad/always -> not assessable
      const tools = toolsFromMatcher(matcher);
      if (tools.length === 0) continue;
      for (const h of group.hooks ?? []) {
        if (typeof h?.command !== 'string') continue;
        const name = hookName(h.command);
        if (name === undefined) continue;
        const existing = out.get(name) ?? [];
        for (const t of tools) if (!existing.includes(t)) existing.push(t);
        out.set(name, existing);
      }
    }
  }

  return new Map([...out].map(([name, tools]) => [name, { tools }]));
}
