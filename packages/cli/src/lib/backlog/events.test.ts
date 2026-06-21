import { describe, expect, test } from 'vitest';
import { type BacklogEvent, parseWorkerEvents } from './events.js';

describe('parseWorkerEvents — VOID_EVENT worker protocol', () => {
  test('parses a PHASE marker', () => {
    expect(parseWorkerEvents('VOID_EVENT: PHASE brainstorm')).toEqual<BacklogEvent[]>([
      { kind: 'phase', phase: 'brainstorm' },
    ]);
  });

  test('parses a DECISION marker, trimming the text', () => {
    expect(parseWorkerEvents('VOID_EVENT: DECISION  keep the adapter thin  ')).toEqual<BacklogEvent[]>([
      { kind: 'decision', text: 'keep the adapter thin' },
    ]);
  });

  test('parses a BRANCH marker', () => {
    expect(parseWorkerEvents('VOID_EVENT: BRANCH feat/lin-42-thing')).toEqual<BacklogEvent[]>([
      { kind: 'branch', name: 'feat/lin-42-thing' },
    ]);
  });

  test('parses a PR marker', () => {
    expect(parseWorkerEvents('VOID_EVENT: PR https://github.com/org/repo/pull/7')).toEqual<BacklogEvent[]>([
      { kind: 'pr', ref: 'https://github.com/org/repo/pull/7' },
    ]);
  });

  test('parses a COMPLETED result with ticket and detail', () => {
    expect(parseWorkerEvents('VOID_AUTONOMOUS_RESULT: COMPLETED LIN-42 shipped the fix')).toEqual<BacklogEvent[]>([
      { kind: 'result', status: 'completed', ticket: 'LIN-42', detail: 'shipped the fix' },
    ]);
  });

  test('parses a BLOCKED result with ticket only', () => {
    expect(parseWorkerEvents('VOID_AUTONOMOUS_RESULT: BLOCKED LIN-9')).toEqual<BacklogEvent[]>([
      { kind: 'result', status: 'blocked', ticket: 'LIN-9' },
    ]);
  });

  test('parses NO_TICKETS as a bare drain signal', () => {
    expect(parseWorkerEvents('VOID_AUTONOMOUS_RESULT: NO_TICKETS')).toEqual<BacklogEvent[]>([
      { kind: 'result', status: 'no_tickets' },
    ]);
  });

  test('extracts markers interleaved with prose across lines', () => {
    const text = ['thinking out loud', 'VOID_EVENT: PHASE plan', 'more prose', 'VOID_EVENT: BRANCH b'].join('\n');
    expect(parseWorkerEvents(text)).toEqual<BacklogEvent[]>([
      { kind: 'phase', phase: 'plan' },
      { kind: 'branch', name: 'b' },
    ]);
  });

  test('drops unknown result statuses and non-marker lines', () => {
    expect(parseWorkerEvents('VOID_AUTONOMOUS_RESULT: WAT LIN-1')).toEqual([]);
    expect(parseWorkerEvents('just a normal line')).toEqual([]);
    expect(parseWorkerEvents('')).toEqual([]);
  });
});
