import { describe, expect, it } from 'vitest';
import { formatEvent, renderEvent } from './render.js';

// Tests run non-TTY, so the render layer disables color: assertions match plain text.

describe('formatEvent', () => {
  it('renders a session header with the model', () => {
    expect(formatEvent({ kind: 'init', model: 'opus' })).toContain('session opus');
  });

  it('renders phase, skill, edit, commit rows with their label', () => {
    expect(formatEvent({ kind: 'phase', phase: 'plan' })).toContain('plan');
    expect(formatEvent({ kind: 'skill', name: 'harness:tdd' })).toContain('harness:tdd');
    expect(formatEvent({ kind: 'edit', path: 'src/a.ts' })).toContain('src/a.ts');
    expect(formatEvent({ kind: 'commit', subject: 'feat: x' })).toContain('feat: x');
  });

  it('clips long bash commands', () => {
    const long = `echo ${'x'.repeat(200)}`;
    const out = formatEvent({ kind: 'bash', command: long });
    expect(out).toBeDefined();
    expect((out as string).length).toBeLessThan(200);
    expect(out).toContain('…');
  });

  it('marks a completed result with the ticket', () => {
    const out = formatEvent({ kind: 'result', status: 'completed', ticket: 'DEV-42' });
    expect(out).toContain('DEV-42');
    expect(out).toContain('completed');
  });

  it('marks a blocked result with the detail', () => {
    const out = formatEvent({ kind: 'result', status: 'blocked', ticket: 'DEV-44', detail: 'no criteria' });
    expect(out).toContain('DEV-44');
    expect(out).toContain('blocked');
    expect(out).toContain('no criteria');
  });

  it('renders nothing for session-end and unknown', () => {
    expect(formatEvent({ kind: 'session-end', isError: false })).toBeUndefined();
    expect(formatEvent({ kind: 'unknown' })).toBeUndefined();
  });
});

describe('renderEvent', () => {
  it('writes one line for a renderable event', () => {
    const lines: string[] = [];
    renderEvent({ kind: 'phase', phase: 'verify' }, (l) => lines.push(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('verify');
  });

  it('writes nothing for a non-rendering event', () => {
    const lines: string[] = [];
    renderEvent({ kind: 'session-end', isError: false }, (l) => lines.push(l));
    expect(lines).toEqual([]);
  });
});
