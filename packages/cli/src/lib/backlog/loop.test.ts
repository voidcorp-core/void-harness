import { describe, expect, it } from 'vitest';
import { type IterationResult, runLoop } from './orchestrator.js';

function scripted(statuses: readonly IterationResult['status'][]): (i: number) => Promise<IterationResult> {
  return (i) => Promise.resolve({ status: statuses[i - 1] ?? 'no_tickets', events: [], ticket: `T-${i}` });
}

describe('runLoop', () => {
  it('stops and reports drained on NO_TICKETS, without counting it', async () => {
    const s = await runLoop({
      maxIterations: 10,
      maxFailures: 2,
      iterate: scripted(['completed', 'blocked', 'no_tickets']),
    });
    expect(s.stopReason).toBe('drained');
    expect(s.tickets).toHaveLength(2);
    expect(s.completed).toBe(1);
    expect(s.blocked).toBe(1);
  });

  it('respects the iteration cap', async () => {
    const s = await runLoop({
      maxIterations: 3,
      maxFailures: 5,
      iterate: scripted(['completed', 'completed', 'completed', 'completed']),
    });
    expect(s.stopReason).toBe('max-iterations');
    expect(s.tickets).toHaveLength(3);
  });

  it('trips the circuit breaker on consecutive failures', async () => {
    let calls = 0;
    const s = await runLoop({
      maxIterations: 10,
      maxFailures: 2,
      iterate: (i) => {
        calls = i;
        return Promise.resolve({ status: 'failed', events: [], ticket: `T-${i}` });
      },
    });
    expect(s.stopReason).toBe('circuit-break');
    expect(s.failed).toBe(2);
    expect(calls).toBe(2); // breaker stops before the 3rd iterate call
  });

  it('resets the failure streak after a clean outcome', async () => {
    const s = await runLoop({
      maxIterations: 10,
      maxFailures: 2,
      iterate: scripted(['failed', 'completed', 'failed', 'no_tickets']),
    });
    expect(s.stopReason).toBe('drained');
    expect(s.failed).toBe(2);
    expect(s.completed).toBe(1);
  });
});
