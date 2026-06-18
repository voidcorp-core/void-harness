import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type BacklogEvent, parseLine, parseStream } from './stream.js';

const fixture = readFileSync(new URL('./fixtures/iteration.stream.jsonl', import.meta.url), 'utf8');

describe('parseLine', () => {
  it('returns [] for a blank line', () => {
    expect(parseLine('')).toEqual([]);
    expect(parseLine('   ')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseLine('this is not json')).toEqual([]);
  });

  it('returns [] for an unknown event type', () => {
    expect(parseLine('{"type":"some_future_event_type","payload":{}}')).toEqual([]);
  });

  it('maps a system init to an init event with the model', () => {
    expect(parseLine('{"type":"system","subtype":"init","model":"opus"}')).toEqual([
      { kind: 'init', model: 'opus' },
    ]);
  });

  it('ignores non-init system events (hooks)', () => {
    expect(parseLine('{"type":"system","subtype":"hook_started"}')).toEqual([]);
  });

  it('extracts a PHASE marker from assistant text', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"VOID_EVENT: PHASE plan"}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'phase', phase: 'plan' }]);
  });

  it('extracts a DECISION marker from assistant text', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"VOID_EVENT: DECISION use a queue"}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'decision', text: 'use a queue' }]);
  });

  it('maps a Skill tool_use to a skill event', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"command":"harness:tdd"}}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'skill', name: 'harness:tdd' }]);
  });

  it('maps an Edit/Write tool_use to an edit event with the path', () => {
    const edit = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"src/a.ts"}}]}}';
    expect(parseLine(edit)).toEqual([{ kind: 'edit', path: 'src/a.ts' }]);
  });

  it('maps a git-commit Bash to a commit event with the subject', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git commit -m \\"feat: x\\""}}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'commit', subject: 'feat: x' }]);
  });

  it('maps a non-commit Bash to a bash event', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"pnpm test"}}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'bash', command: 'pnpm test' }]);
  });

  it('maps an unrecognised tool_use to a generic tool event', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{}}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'tool', name: 'Grep' }]);
  });

  it('parses a COMPLETED result marker with the ticket id', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"VOID_AUTONOMOUS_RESULT: COMPLETED DEV-42"}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'result', status: 'completed', ticket: 'DEV-42' }]);
  });

  it('parses a BLOCKED result marker with ticket and detail', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"VOID_AUTONOMOUS_RESULT: BLOCKED DEV-44 missing acceptance criteria"}]}}';
    expect(parseLine(line)).toEqual([
      { kind: 'result', status: 'blocked', ticket: 'DEV-44', detail: 'missing acceptance criteria' },
    ]);
  });

  it('parses a NO_TICKETS result marker', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"VOID_AUTONOMOUS_RESULT: NO_TICKETS"}]}}';
    expect(parseLine(line)).toEqual([{ kind: 'result', status: 'no_tickets' }]);
  });

  it('maps a final result event to session-end', () => {
    const line = '{"type":"result","is_error":false,"total_cost_usd":0.5,"result":"done"}';
    expect(parseLine(line)).toEqual([{ kind: 'session-end', isError: false, costUsd: 0.5 }]);
  });

  it('emits multiple events from one assistant message (text + tool_use)', () => {
    const line =
      '{"type":"assistant","message":{"content":[{"type":"text","text":"VOID_EVENT: PHASE plan"},{"type":"tool_use","name":"Write","input":{"file_path":"p.md"}}]}}';
    expect(parseLine(line)).toEqual([
      { kind: 'phase', phase: 'plan' },
      { kind: 'edit', path: 'p.md' },
    ]);
  });
});

describe('parseStream over the recorded fixture', () => {
  const events = parseStream(fixture);
  const kinds = (k: BacklogEvent['kind']) => events.filter((e) => e.kind === k);

  it('drops malformed, unknown, and hook noise', () => {
    expect(kinds('unknown')).toEqual([]);
  });

  it('recovers the full meaningful sequence in order', () => {
    expect(events).toEqual([
      { kind: 'init', model: 'claude-opus-4-8' },
      { kind: 'phase', phase: 'pick' },
      { kind: 'skill', name: 'harness:brainstorming' },
      { kind: 'phase', phase: 'plan' },
      { kind: 'edit', path: '.void/autonomous-runs/DEV-42.plan.md' },
      { kind: 'edit', path: 'src/rate-limit.ts' },
      { kind: 'decision', text: 'token bucket over sliding window (ADR-0007)' },
      { kind: 'commit', subject: 'feat: add rate limiter' },
      { kind: 'result', status: 'completed', ticket: 'DEV-42' },
      { kind: 'session-end', isError: false, costUsd: 0.12 },
    ]);
  });
});
