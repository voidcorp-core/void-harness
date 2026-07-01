import { describe, expect, it } from 'vitest';
import { parseHookMatchers } from './hook-matchers.js';

const plugin = (hooks: unknown): string => JSON.stringify({ name: 'core', hooks });

describe('parseHookMatchers', () => {
  it('derives tools from a specific matcher, keyed by hook basename', () => {
    const text = plugin({
      PreToolUse: [
        { matcher: 'Edit|Write', hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/tdd-guard.sh' }] },
      ],
    });
    const map = parseHookMatchers(text);
    expect(map.get('tdd-guard')).toEqual({ tools: ['Edit', 'Write'] });
  });

  it('skips the wildcard "*" matcher (fires on everything, never dead)', () => {
    const text = plugin({
      PreToolUse: [
        { matcher: '*', hooks: [{ command: '${CLAUDE_PLUGIN_ROOT}/hooks/activation-meter.sh' }] },
      ],
    });
    expect(parseHookMatchers(text).has('activation-meter')).toBe(false);
  });

  it('skips a group with no matcher (e.g. SessionStart, always fires)', () => {
    const text = plugin({
      SessionStart: [{ hooks: [{ command: '${CLAUDE_PLUGIN_ROOT}/hooks/sessionstart-context.sh' }] }],
    });
    expect(parseHookMatchers(text).has('sessionstart-context')).toBe(false);
  });

  it('unions tools when a hook appears under several events/groups', () => {
    const text = plugin({
      PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ command: 'x/hooks/fmt.sh' }] }],
      PostToolUse: [{ matcher: 'Bash', hooks: [{ command: 'x/hooks/fmt.sh' }] }],
    });
    expect(parseHookMatchers(text).get('fmt')).toEqual({ tools: ['Edit', 'Write', 'Bash'] });
  });

  it('applies the group matcher to every hook in the group', () => {
    const text = plugin({
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ command: 'x/hooks/a.sh' }, { command: 'x/hooks/b.sh' }] },
      ],
    });
    const map = parseHookMatchers(text);
    expect(map.get('a')).toEqual({ tools: ['Bash'] });
    expect(map.get('b')).toEqual({ tools: ['Bash'] });
  });

  it('is tolerant: malformed JSON yields an empty map, never throws', () => {
    expect(parseHookMatchers('{ not json').size).toBe(0);
    expect(parseHookMatchers('').size).toBe(0);
    expect(parseHookMatchers('{}').size).toBe(0);
  });
});
