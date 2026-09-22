import { describe, expect, it } from 'vitest';
import {
  admitConflictClass,
  admitCuratorQueue,
  admitReviewVerdict,
  admitTicketReadiness,
  BLOCKING_MAX,
  CURATOR_QUEUE_MAX,
  JUSTIFICATION_MAX,
  REASON_MAX,
  type Admission,
} from './judgments.js';

// Every judgment an agent returns crosses this boundary before the loop acts on
// it. The refusals matter as much as the admissions: a malformed answer must
// stop the loop with the name of the field at fault, never become a default.

function refusal<T>(admission: Admission<T>): string {
  if (admission.ok) throw new Error('expected a refusal, got an admission');
  return admission.reason;
}

function admitted<T>(admission: Admission<T>): T {
  if (!admission.ok) throw new Error(`expected an admission, got: ${admission.reason}`);
  return admission.value;
}

const entry = (ticketId: string) => ({
  ticketId,
  justification: 'Unblocks the loop kernel, which every later slice needs.',
  footprint: ['packages/cli/src/lib/autopilot/loop.ts'],
});

const blocking = {
  location: 'packages/cli/src/lib/autopilot/loop.ts:42',
  scenario: 'Two tickets with nested areas both receive a slot and edit the same file.',
  correction: 'Sequence the pair when their reaches nest.',
};

describe('admitTicketReadiness', () => {
  it.each(['ready', 'needs-enrichment', 'ambiguous'] as const)('admits %s', (verdict) => {
    const value = admitted(admitTicketReadiness({ verdict, reason: 'Acceptance criteria named.' }));
    expect(value).toEqual({ verdict, reason: 'Acceptance criteria named.' });
  });

  it('refuses a verdict outside the enumeration, naming the field', () => {
    expect(refusal(admitTicketReadiness({ verdict: 'maybe', reason: 'x' }))).toContain('verdict');
  });

  it('refuses a missing reason, naming the field', () => {
    expect(refusal(admitTicketReadiness({ verdict: 'ready' }))).toContain('reason');
  });

  it.each(['', '   '])('refuses a blank reason %j', (reason) => {
    expect(refusal(admitTicketReadiness({ verdict: 'ready', reason }))).toContain('reason');
  });

  it('refuses a reason over the bound', () => {
    const reason = 'x'.repeat(REASON_MAX + 1);
    expect(refusal(admitTicketReadiness({ verdict: 'ready', reason }))).toContain('reason');
  });

  it('refuses an unknown field rather than ignoring it', () => {
    const judgment = { verdict: 'ready', reason: 'Clear.', confidence: 0.9 };
    expect(refusal(admitTicketReadiness(judgment))).toContain('confidence');
  });

  it.each([undefined, 'ready', 7, []])('refuses a non-object answer %j', (value) => {
    expect(admitTicketReadiness(value).ok).toBe(false);
  });
});

describe('admitCuratorQueue', () => {
  it('admits an ordered queue and keeps its order', () => {
    const value = admitted(admitCuratorQueue({ entries: [entry('DEV-2'), entry('DEV-1')] }));
    expect(value.entries.map((queued) => queued.ticketId)).toEqual(['DEV-2', 'DEV-1']);
  });

  it('admits an empty queue, which is how the curator says nothing is ready', () => {
    expect(admitted(admitCuratorQueue({ entries: [] })).entries).toEqual([]);
  });

  it('admits a queue at the bound', () => {
    const entries = Array.from({ length: CURATOR_QUEUE_MAX }, (_, index) => entry(`DEV-${index}`));
    expect(admitted(admitCuratorQueue({ entries })).entries).toHaveLength(CURATOR_QUEUE_MAX);
  });

  it('reads each footprint area the way footprint-area reads it', () => {
    const queued = { ...entry('DEV-1'), footprint: ['./packages/core/templates/'] };
    const value = admitted(admitCuratorQueue({ entries: [queued] }));
    expect(value.entries[0]?.footprint).toEqual(['packages/core/templates']);
  });

  it('refuses a queue over the bound', () => {
    const entries = Array.from({ length: CURATOR_QUEUE_MAX + 1 }, (_, i) => entry(`DEV-${i}`));
    expect(refusal(admitCuratorQueue({ entries }))).toContain('entries');
  });

  it('refuses a ticket queued twice, naming the second place', () => {
    const reason = refusal(admitCuratorQueue({ entries: [entry('DEV-1'), entry('DEV-1')] }));
    expect(reason).toContain('entries.1.ticketId');
  });

  it('refuses a missing ticket id, naming the field', () => {
    const { ticketId: _dropped, ...rest } = entry('DEV-1');
    expect(refusal(admitCuratorQueue({ entries: [rest] }))).toContain('entries.0.ticketId');
  });

  it.each(['', 'DEV 1', 'dev/1', '-DEV-1'])('refuses the ticket id %j', (ticketId) => {
    expect(refusal(admitCuratorQueue({ entries: [entry(ticketId)] }))).toContain('ticketId');
  });

  it.each(['', '  ', 'x'.repeat(JUSTIFICATION_MAX + 1)])(
    'refuses the justification %j',
    (justification) => {
      const queued = { ...entry('DEV-1'), justification };
      const reason = refusal(admitCuratorQueue({ entries: [queued] }));
      expect(reason).toContain('entries.0.justification');
    },
  );

  it('refuses an entry without a declared footprint', () => {
    const queued = { ...entry('DEV-1'), footprint: [] };
    expect(refusal(admitCuratorQueue({ entries: [queued] }))).toContain('entries.0.footprint');
  });

  it.each(['', './', '/abs/path', 'packages//core', '../outside'])(
    'refuses the area %j, which claims nothing',
    (area) => {
      const queued = { ...entry('DEV-1'), footprint: [area] };
      const reason = refusal(admitCuratorQueue({ entries: [queued] }));
      expect(reason).toContain('entries.0.footprint.0');
    },
  );

  it('refuses a missing entries list', () => {
    expect(refusal(admitCuratorQueue({}))).toContain('entries');
  });
});

describe('admitConflictClass', () => {
  it.each(['mechanical', 'semantic'] as const)('admits %s', (conflict) => {
    const judgment = { class: conflict, reason: 'Both sides reordered the same import block.' };
    expect(admitted(admitConflictClass(judgment))).toEqual(judgment);
  });

  it('refuses a class outside the enumeration, naming the field', () => {
    expect(refusal(admitConflictClass({ class: 'trivial', reason: 'x' }))).toContain('class');
  });

  it('refuses a missing class', () => {
    expect(refusal(admitConflictClass({ reason: 'x' }))).toContain('class');
  });

  it.each(['', '\n', 'x'.repeat(REASON_MAX + 1)])('refuses the reason %j', (reason) => {
    expect(refusal(admitConflictClass({ class: 'mechanical', reason }))).toContain('reason');
  });
});

describe('admitReviewVerdict', () => {
  it('admits a first round with a blocking finding and an advisory', () => {
    const judgment = {
      round: 1,
      blocking: [blocking],
      advisory: [{ note: 'The helper name could say what it measures.' }],
    };
    expect(admitted(admitReviewVerdict(judgment))).toEqual(judgment);
  });

  it('admits a clean second round', () => {
    const judgment = { round: 2, blocking: [], advisory: [] };
    expect(admitted(admitReviewVerdict(judgment))).toEqual(judgment);
  });

  it('admits an advisory anchored to a location', () => {
    const advisory = [{ location: 'docs/x.md:3', note: 'A sentence runs long.' }];
    const judgment = { round: 1, blocking: [], advisory };
    expect(admitted(admitReviewVerdict(judgment)).advisory).toEqual(advisory);
  });

  it.each([0, 3, 1.5, '1'])('refuses the round %j', (round) => {
    const reason = refusal(admitReviewVerdict({ round, blocking: [], advisory: [] }));
    expect(reason).toContain('round');
  });

  it.each(['location', 'scenario', 'correction'] as const)(
    'refuses a blocking finding without its %s',
    (field) => {
      const { [field]: _dropped, ...rest } = blocking;
      const reason = refusal(admitReviewVerdict({ round: 1, blocking: [rest], advisory: [] }));
      expect(reason).toContain(`blocking.0.${field}`);
    },
  );

  it.each(['', '   '])('refuses a blocking finding with the blank scenario %j', (scenario) => {
    const finding = { ...blocking, scenario };
    const reason = refusal(admitReviewVerdict({ round: 1, blocking: [finding], advisory: [] }));
    expect(reason).toContain('blocking.0.scenario');
  });

  it.each(['loop.ts', 'loop.ts:0', 'loop.ts:x', ':12', 'a b.ts:3'])(
    'refuses the location %j, which is not file:line',
    (location) => {
      const finding = { ...blocking, location };
      const reason = refusal(admitReviewVerdict({ round: 1, blocking: [finding], advisory: [] }));
      expect(reason).toContain('blocking.0.location');
    },
  );

  it('refuses a missing advisory list rather than defaulting it', () => {
    expect(refusal(admitReviewVerdict({ round: 1, blocking: [] }))).toContain('advisory');
  });

  it('refuses an advisory with a blank note', () => {
    const judgment = { round: 1, blocking: [], advisory: [{ note: '' }] };
    const reason = refusal(admitReviewVerdict(judgment));
    expect(reason).toContain('advisory.0.note');
  });

  it('refuses too many blocking findings', () => {
    const findings = Array.from({ length: BLOCKING_MAX + 1 }, () => blocking);
    const reason = refusal(admitReviewVerdict({ round: 1, blocking: findings, advisory: [] }));
    expect(reason).toContain('blocking');
  });
});
