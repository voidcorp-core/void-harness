import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateSessionCosts, readSessionCosts } from './transcript-cost.js';

// A cost-bearing (assistant) transcript line, matching Claude Code's shape.
const line = (over: {
  sessionId: string;
  ts?: string;
  model?: string;
  in?: number;
  out?: number;
  cacheRead?: number;
  cacheCreation?: number;
}): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: over.ts ?? '2026-07-01T10:00:00Z',
    sessionId: over.sessionId,
    message: {
      model: over.model ?? 'claude-opus-4-8',
      usage: {
        input_tokens: over.in ?? 0,
        output_tokens: over.out ?? 0,
        cache_read_input_tokens: over.cacheRead ?? 0,
        cache_creation_input_tokens: over.cacheCreation ?? 0,
      },
    },
  });

const bySession = (text: string, id: string) =>
  aggregateSessionCosts(text).costs.find((c) => c.sessionId === id);

describe('aggregateSessionCosts', () => {
  it('sums usage across a session and maps the cache buckets', () => {
    const text = [
      line({ sessionId: 's1', in: 100, out: 10, cacheRead: 500, cacheCreation: 40 }),
      line({ sessionId: 's1', in: 50, out: 5, cacheRead: 200, cacheCreation: 0 }),
    ].join('\n');
    const c = bySession(text, 's1');
    expect(c?.tokens).toEqual({ in: 150, out: 15, cacheRead: 700, cacheCreation: 40 });
    expect(c?.model).toBe('claude-opus-4-8');
  });

  it('keeps sessions separate', () => {
    const text = [line({ sessionId: 's1', in: 100 }), line({ sessionId: 's2', in: 300 })].join('\n');
    expect(bySession(text, 's1')?.tokens.in).toBe(100);
    expect(bySession(text, 's2')?.tokens.in).toBe(300);
  });

  it('records the first and last timestamp seen', () => {
    const text = [
      line({ sessionId: 's1', ts: '2026-07-01T10:05:00Z' }),
      line({ sessionId: 's1', ts: '2026-07-01T10:01:00Z' }),
      line({ sessionId: 's1', ts: '2026-07-01T10:09:00Z' }),
    ].join('\n');
    const c = bySession(text, 's1');
    expect(c?.tsRange).toEqual({ first: '2026-07-01T10:01:00Z', last: '2026-07-01T10:09:00Z' });
  });

  it('skips malformed JSON lines and counts them', () => {
    const text = ['{ not json', line({ sessionId: 's1', in: 10 }), '{"also":'].join('\n');
    const r = aggregateSessionCosts(text);
    expect(r.skipped).toBe(2);
    expect(r.costs).toHaveLength(1);
  });

  it('ignores non-cost lines (no usage) without counting them as skipped', () => {
    const userLine = JSON.stringify({ type: 'user', sessionId: 's1', timestamp: '2026-07-01T10:00:00Z', message: { role: 'user' } });
    const r = aggregateSessionCosts([userLine, line({ sessionId: 's1', in: 10 })].join('\n'));
    expect(r.skipped).toBe(0);
    expect(bySession([userLine, line({ sessionId: 's1', in: 10 })].join('\n'), 's1')?.tokens.in).toBe(10);
  });

  it('skips a cost line missing sessionId (drift) and counts it', () => {
    const drift = JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T10:00:00Z', message: { usage: { input_tokens: 5 } } });
    const r = aggregateSessionCosts(drift);
    expect(r.skipped).toBe(1);
    expect(r.costs).toEqual([]);
  });

  it('returns empty with zero skipped for empty input', () => {
    expect(aggregateSessionCosts('')).toEqual({ costs: [], skipped: 0 });
    expect(aggregateSessionCosts('\n\n')).toEqual({ costs: [], skipped: 0 });
  });
});

describe('readSessionCosts', () => {
  it('reads and aggregates transcripts under the encoded cwd dir', () => {
    const projectsDir = mkdtempSync(join(tmpdir(), 'void-tc-'));
    const cwd = '/Users/x/void-harness';
    const encoded = '-Users-x-void-harness';
    mkdirSync(join(projectsDir, encoded));
    writeFileSync(join(projectsDir, encoded, 'a.jsonl'), line({ sessionId: 's1', in: 100 }));
    writeFileSync(join(projectsDir, encoded, 'b.jsonl'), line({ sessionId: 's2', in: 200 }));
    const r = readSessionCosts(cwd, { projectsDir });
    expect(r.costs.map((c) => c.sessionId).sort()).toEqual(['s1', 's2']);
    expect(r.skipped).toBe(0);
  });

  it('degrades gracefully to empty when the projects dir is absent', () => {
    const r = readSessionCosts('/nope', { projectsDir: join(tmpdir(), 'void-tc-does-not-exist') });
    expect(r).toEqual({ costs: [], skipped: 0 });
  });
});
