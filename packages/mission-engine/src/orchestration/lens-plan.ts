// How many lenses run, in what shape, on the runtime that is actually present.
//
// Parity settles what is installed. It does not settle how a pass runs when the
// runtimes differ in what they can do, and they do: Claude Code carries
// agent-to-agent messaging and a twenty-subagent ceiling, Codex documents the
// opposite -- subagents return results to the parent and never message each
// other -- and caps at six.
//
// Levelling every pass to the intersection would cap quality at the weakest
// supported runtime forever, and each new runtime could only lower the ceiling.
// So a pass declares what it wants, each runtime is taken to its own maximum,
// and anything it cannot do degrades rather than blocks. See the
// adapters-take-each-runtime-maximum decision.
//
// Pure. This judges a declared demand against an observed capability; it spawns
// nothing and asks no runtime for anything.
//
// Two properties keep the degradation honest, and both are enforced here rather
// than left to a caller. The plan always carries a reason naming the runtime, so
// a result can never imply the stronger pass it did not run. And the capability
// is a parameter, never the runtime's name: agent teams are experimental and off
// by default, so reading the name would claim a capability the session lacks.

/** What a pass asks for, independent of who will run it. */
export interface LensDemand {
  readonly declaredLenses: number;
  /**
   * `independent` wants N separate readings. `adversarial-debate` additionally
   * wants them to challenge each other, which not every runtime can carry.
   */
  readonly wants: 'independent' | 'adversarial-debate';
}

/** What the runtime in front of us can actually do, as observed. */
export interface RuntimeCapability {
  readonly runtime: string;
  readonly maxConcurrentAgents: number;
  /** Whether agents can message each other, rather than only the caller. */
  readonly agentToAgent: boolean;
}

export type OrchestrationMode = 'debate' | 'fan-out' | 'serial';

export interface LensPlan {
  readonly mode: OrchestrationMode;
  /** How many lenses actually run at once. */
  readonly lenses: number;
  readonly declaredLenses: number;
  /** True when the pass ran weaker than it asked for, for any reason. */
  readonly degraded: boolean;
  /** What ran and why, always naming the runtime. Never empty. */
  readonly reason: string;
}

function invalid(message: string): never {
  throw new Error(message);
}

export function planLensExecution(demand: LensDemand, capability: RuntimeCapability): LensPlan {
  if (!Number.isInteger(demand.declaredLenses) || demand.declaredLenses < 1) {
    // An empty pass would return a clean verdict nobody produced, which is worse
    // than any degraded one.
    invalid(`a pass must declare at least one lens, got ${String(demand.declaredLenses)}`);
  }
  if (!Number.isInteger(capability.maxConcurrentAgents) || capability.maxConcurrentAgents < 1) {
    invalid(`${capability.runtime} reports room for ${String(capability.maxConcurrentAgents)} agents`);
  }

  const lenses = Math.min(demand.declaredLenses, capability.maxConcurrentAgents);
  const capped = lenses < demand.declaredLenses;
  const wantsDebate = demand.wants === 'adversarial-debate';

  if (lenses === 1) {
    return {
      mode: 'serial',
      lenses,
      declaredLenses: demand.declaredLenses,
      degraded: true,
      reason: `${capability.runtime} runs one agent at a time, so the ${String(demand.declaredLenses)} declared `
        + 'lenses run in sequence: slower, and the same questions still get asked',
    };
  }

  const cappedNote = capped
    ? ` (${String(demand.declaredLenses)} lenses declared, ${String(lenses)} run at once, `
      + `which is ${capability.runtime}'s ceiling)`
    : '';

  if (wantsDebate && !capability.agentToAgent) {
    return {
      mode: 'fan-out',
      lenses,
      declaredLenses: demand.declaredLenses,
      degraded: true,
      reason: `${capability.runtime} agents cannot message each other, so the debate runs as successive `
        + `arbitrated fan-out rounds instead of a conversation${cappedNote}`,
    };
  }
  if (wantsDebate) {
    return {
      mode: 'debate',
      lenses,
      declaredLenses: demand.declaredLenses,
      degraded: capped,
      reason: `${capability.runtime} carries a debate between ${String(lenses)} lenses${cappedNote}`,
    };
  }
  return {
    mode: 'fan-out',
    lenses,
    declaredLenses: demand.declaredLenses,
    degraded: capped,
    reason: `${capability.runtime} runs ${String(lenses)} independent lenses and consolidates them${cappedNote}`,
  };
}
