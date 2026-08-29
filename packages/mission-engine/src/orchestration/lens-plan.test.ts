import { describe, expect, it } from 'vitest';
import { planLensExecution, type RuntimeCapability } from './lens-plan.js';

// Measured against each runtime's own documentation, not guessed.
const CLAUDE_TEAMS: RuntimeCapability = { runtime: 'claude', maxConcurrentAgents: 20, agentToAgent: true };
const CLAUDE_PLAIN: RuntimeCapability = { runtime: 'claude', maxConcurrentAgents: 20, agentToAgent: false };
const CODEX: RuntimeCapability = { runtime: 'codex', maxConcurrentAgents: 6, agentToAgent: false };
const UNKNOWN: RuntimeCapability = { runtime: 'kimi', maxConcurrentAgents: 1, agentToAgent: false };

const plan = (wants: 'independent' | 'adversarial-debate', lenses: number, capability: RuntimeCapability) =>
  planLensExecution({ declaredLenses: lenses, wants }, capability);

describe('taking each runtime to its maximum', () => {
  it('lets lenses argue where the runtime can carry a conversation', () => {
    const outcome = plan('adversarial-debate', 5, CLAUDE_TEAMS);

    expect(outcome.mode).toBe('debate');
    expect(outcome.lenses).toBe(5);
    expect(outcome.degraded).toBe(false);
  });

  it('falls back to arbitrated rounds where agents cannot talk to each other', () => {
    // Codex documents it outright: subagents return results to the parent and
    // never message each other. The same question still gets asked; the
    // controller arbitrates successive rounds instead of a conversation.
    const outcome = plan('adversarial-debate', 5, CODEX);

    expect(outcome.mode).toBe('fan-out');
    expect(outcome.degraded).toBe(true);
    expect(outcome.reason).toMatch(/each other|agent-to-agent/i);
  });

  it('does not invent a debate on Claude when teams are switched off', () => {
    // Agent teams are experimental and off by default, so the runtime NAME is
    // never the test. Reading it would claim a capability the session lacks.
    expect(plan('adversarial-debate', 5, CLAUDE_PLAIN).mode).toBe('fan-out');
  });

  it('runs a plain fan-out undegraded when nobody asked for a debate', () => {
    const outcome = plan('independent', 4, CODEX);

    expect(outcome.mode).toBe('fan-out');
    expect(outcome.degraded).toBe(false);
  });

  it('degrades to one lens at a time rather than refusing an unknown runtime', () => {
    // A runtime nobody has written an adapter for is slower, never blocked.
    // Support must not be a precondition for working at all.
    const outcome = plan('adversarial-debate', 5, UNKNOWN);

    expect(outcome.mode).toBe('serial');
    expect(outcome.lenses).toBe(1);
    expect(outcome.degraded).toBe(true);
  });
});

describe('never claiming more than the runtime allows', () => {
  it('caps the lenses at the runtime ceiling and says it capped them', () => {
    const outcome = plan('independent', 12, CODEX);

    expect(outcome.lenses).toBe(6);
    expect(outcome.declaredLenses).toBe(12);
    expect(outcome.degraded).toBe(true);
    expect(outcome.reason).toContain('12');
    expect(outcome.reason).toContain('6');
  });

  it('leaves a demand under the ceiling alone', () => {
    expect(plan('independent', 3, CODEX).lenses).toBe(3);
    expect(plan('independent', 3, CODEX).degraded).toBe(false);
  });

  it('always names what actually ran, so a result cannot imply the stronger pass', () => {
    for (const capability of [CLAUDE_TEAMS, CLAUDE_PLAIN, CODEX, UNKNOWN]) {
      const outcome = plan('adversarial-debate', 5, capability);
      expect(outcome.reason.length).toBeGreaterThan(0);
      expect(outcome.reason).toContain(capability.runtime);
    }
  });

  it('refuses a demand for no lenses instead of planning an empty pass', () => {
    // Zero lenses would return a clean verdict nobody produced, which is the
    // one outcome worse than a degraded pass.
    expect(() => plan('independent', 0, CODEX)).toThrow();
    expect(() => plan('independent', -1, CODEX)).toThrow();
  });

  it('refuses a capability claiming no room to run anything', () => {
    expect(() => plan('independent', 3, { runtime: 'broken', maxConcurrentAgents: 0, agentToAgent: false }))
      .toThrow();
  });
});
