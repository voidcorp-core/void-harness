// What the runtime in front of us can actually do, observed rather than assumed.
//
// The lens planner takes a capability as a parameter precisely so nothing reads a
// runtime name to decide what a session can do. This is the half that fills it,
// and it is the only place a runtime name appears at all.
//
// The defaults are each runtime's documented ceiling, not a guess:
//
//   claude  20 concurrent subagents (CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS), and
//           agent-to-agent messaging only when agent teams are switched on --
//           they are experimental and off by default.
//   codex   6 concurrent (agents.max_concurrent_threads_per_session), and no
//           agent-to-agent messaging at all: its own documentation states that
//           subagents return results to the parent and never message each other.
//
// A runtime the harness has never met is credited with one lens at a time. Not
// zero, which would refuse the pass, and not someone else's ceiling.

import type { OrchestrationCapability } from '@voidcorp/mission-engine';

export type CapabilityEnvironment = Readonly<Partial<Record<string, string>>>;

interface RuntimeDefaults {
  readonly maxConcurrentAgents: number;
  /** Env var an operator can lower the ceiling with, when the runtime has one. */
  readonly ceilingVariable?: string;
  /** Whether agents can message each other, when the runtime supports it at all. */
  readonly agentToAgent: (env: CapabilityEnvironment) => boolean;
}

const NEVER = (): boolean => false;

const KNOWN: Readonly<Record<string, RuntimeDefaults>> = Object.freeze({
  claude: {
    maxConcurrentAgents: 20,
    ceilingVariable: 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS',
    agentToAgent: (env) => env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1',
  },
  codex: {
    maxConcurrentAgents: 6,
    // Not a missing feature to detect: Codex documents that its subagents never
    // message each other, so no flag can turn this on.
    agentToAgent: NEVER,
  },
});

/**
 * A positive integer ceiling, or undefined when the value cannot be used.
 *
 * A malformed setting is not a reason to run a single lens, and not a reason to
 * run a thousand. The caller falls back to the documented default instead.
 */
function configuredCeiling(env: CapabilityEnvironment, variable: string | undefined): number | undefined {
  if (variable === undefined) return undefined;
  const raw = env[variable]?.trim();
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function observeOrchestrationCapability(
  runtime: string,
  env: CapabilityEnvironment,
): OrchestrationCapability {
  const known = KNOWN[runtime];
  if (known === undefined) {
    return { runtime, maxConcurrentAgents: 1, agentToAgent: false };
  }
  return {
    runtime,
    maxConcurrentAgents: configuredCeiling(env, known.ceilingVariable) ?? known.maxConcurrentAgents,
    agentToAgent: known.agentToAgent(env),
  };
}
