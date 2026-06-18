import { describe, expect, it } from 'vitest';
import type { IterationResult } from './orchestrator.js';
import type { BacklogEvent } from './stream.js';
import { buildSummary, renderSummary } from './summary.js';

function result(over: Partial<IterationResult> & { status: IterationResult['status'] }): IterationResult {
  return { events: [], ...over };
}

describe('buildSummary', () => {
  it('counts completed, blocked and failed tickets', () => {
    const s = buildSummary(
      [
        result({ status: 'completed', ticket: 'A' }),
        result({ status: 'blocked', ticket: 'B' }),
        result({ status: 'failed', ticket: 'C' }),
        result({ status: 'completed', ticket: 'D' }),
      ],
      'drained',
    );
    expect(s.completed).toBe(2);
    expect(s.blocked).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.stopReason).toBe('drained');
  });

  it('extracts decisions and the PR ref from an iteration events', () => {
    const events: BacklogEvent[] = [
      { kind: 'decision', text: 'token bucket' },
      { kind: 'decision', text: 'ADR-0007' },
      { kind: 'pr', ref: '#128' },
    ];
    const s = buildSummary([result({ status: 'completed', ticket: 'DEV-42', events })], 'drained');
    expect(s.tickets[0]?.decisions).toEqual(['token bucket', 'ADR-0007']);
    expect(s.tickets[0]?.pr).toBe('#128');
  });

  it('labels a ticket with no id as unknown', () => {
    const s = buildSummary([result({ status: 'failed' })], 'max-iterations');
    expect(s.tickets[0]?.ticket).toBe('unknown');
  });
});

describe('renderSummary', () => {
  it('writes a header, a line per ticket, and a merge list', () => {
    const lines: string[] = [];
    const s = buildSummary(
      [
        result({ status: 'completed', ticket: 'DEV-42', events: [{ kind: 'pr', ref: '#128' }] }),
        result({ status: 'blocked', ticket: 'DEV-44', detail: 'no criteria' }),
      ],
      'drained',
    );
    renderSummary(s, (l) => lines.push(l));
    const text = lines.join('\n');
    expect(text).toContain('end of run');
    expect(text).toContain('DEV-42');
    expect(text).toContain('#128');
    expect(text).toContain('DEV-44');
    expect(text).toContain('no criteria');
    expect(text).toContain('to merge: #128');
  });

  it('omits the merge list when nothing is mergeable', () => {
    const lines: string[] = [];
    renderSummary(buildSummary([result({ status: 'blocked', ticket: 'X' })], 'drained'), (l) => lines.push(l));
    expect(lines.join('\n')).not.toContain('to merge');
  });
});
