import { describe, expect, it } from 'vitest';
import { observeOrchestrationCapability } from './orchestration-capability.js';

describe('what the runtime in front of us can actually do', () => {
  it('reads Claude agent teams from the flag that switches them on', () => {
    // Experimental and off by default, so it is asked rather than assumed.
    const on = observeOrchestrationCapability('claude', { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' });
    const off = observeOrchestrationCapability('claude', {});

    expect(on.agentToAgent).toBe(true);
    expect(off.agentToAgent).toBe(false);
  });

  it('never reports agent-to-agent messaging on Codex, which documents it has none', () => {
    // "Subagents don't directly communicate with each other." Setting Claude's
    // flag in a Codex session must not import a capability the runtime lacks.
    const capability = observeOrchestrationCapability('codex', { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' });

    expect(capability.agentToAgent).toBe(false);
  });

  it('carries each runtime documented ceiling by default', () => {
    expect(observeOrchestrationCapability('claude', {}).maxConcurrentAgents).toBe(20);
    expect(observeOrchestrationCapability('codex', {}).maxConcurrentAgents).toBe(6);
  });

  it('honours a lowered ceiling the operator configured', () => {
    expect(observeOrchestrationCapability('claude', { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '4' }).maxConcurrentAgents)
      .toBe(4);
  });

  it('ignores an unusable ceiling rather than planning against nonsense', () => {
    // A malformed value is not a reason to run one lens, and not a reason to run
    // a thousand. The documented default is the safe answer.
    for (const raw of ['0', '-3', 'many', '', '2.5']) {
      expect(
        observeOrchestrationCapability('claude', { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: raw }).maxConcurrentAgents,
        raw,
      ).toBe(20);
    }
  });

  it('treats a runtime it has never met as able to run one lens at a time', () => {
    // Not zero, which would refuse the pass, and not a guess at someone else's
    // ceiling. One is what any runtime can do, so support is never a
    // precondition for working at all.
    const capability = observeOrchestrationCapability('kimi', {});

    expect(capability.runtime).toBe('kimi');
    expect(capability.maxConcurrentAgents).toBe(1);
    expect(capability.agentToAgent).toBe(false);
  });
});
