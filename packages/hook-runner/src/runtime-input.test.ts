import { describe, expect, it } from 'vitest';
import {
  adaptRuntimeInput,
  deriveMissionId,
} from './runtime-input.js';

describe('runtime input adapter', () => {
  it('maps Claude and Codex-compatible tool payloads without retaining content', () => {
    const adapted = adaptRuntimeInput(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'raw-sensitive-session',
        tool_name: 'Skill',
        tool_input: {
          skill: 'harness:tdd',
          command: 'curl https://example.test?token=super-secret',
          content: 'PRIVATE PROMPT',
        },
      },
      { runtime: 'claude', phase: 'activation', root: '/project' },
    );

    expect(adapted).toMatchObject({
      runtimeSessionId: 'raw-sensitive-session',
      source: 'runtime:claude',
      kind: 'runtime.tool.started',
      subject: 'skill:harness:tdd',
      payload: { category: 'skill', tool: 'Skill' },
    });
    expect(JSON.stringify(adapted)).not.toContain('super-secret');
    expect(JSON.stringify(adapted)).not.toContain('PRIVATE PROMPT');
  });

  it('derives a stable opaque mission ID unless an explicit valid one is supplied', () => {
    const first = deriveMissionId(undefined, 'codex', 'thread-raw-id', '/project');
    const second = deriveMissionId(undefined, 'codex', 'thread-raw-id', '/project');

    expect(first).toBe(second);
    expect(first).toMatch(/^mis_[a-f0-9]{32}$/);
    expect(first).not.toContain('thread-raw-id');
    expect(
      deriveMissionId(
        'mis_0123456789abcdef0123456789abcdef',
        'codex',
        'ignored',
        '/project',
      ),
    ).toBe('mis_0123456789abcdef0123456789abcdef');
  });

  it('rejects an explicit mission ID that could escape the run directory', () => {
    expect(() =>
      deriveMissionId('../../outside', 'codex', 'session', '/project'),
    ).toThrow('HOOK_INVALID_MISSION_ID');
  });
});
