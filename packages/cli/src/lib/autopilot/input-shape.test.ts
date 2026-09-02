import { describe, expect, it } from 'vitest';
import { AutopilotError } from './errors.js';
import { MARKER_BEGIN, MARKER_END } from './linear-marker.js';
import {
  INPUT_SHAPES,
  markerTemplate,
  scaffoldFor,
  validateAgainstShape,
  type AutopilotInputStep,
} from './input-shape.js';

const STEPS = Object.keys(INPUT_SHAPES) as readonly AutopilotInputStep[];

describe('the machine prints the shape it accepts', () => {
  it.each(STEPS)('scaffolds %s with every field the step reads', (step) => {
    const scaffold = scaffoldFor(step);

    for (const field of INPUT_SHAPES[step].fields) {
      expect(Object.hasOwn(scaffold as object, field.name.split('.')[0] ?? ''), field.name)
        .toBe(true);
    }
  });

  it.each(STEPS)('accepts its own scaffold for %s, so the two cannot drift', (step) => {
    // The load-bearing property. A scaffold that its own validator rejects is a
    // second, silently different contract -- which is exactly the failure this
    // slice exists to remove.
    expect(() => validateAgainstShape(scaffoldFor(step), step)).not.toThrow();
  });

  it('renders the scaffold as JSON a person can pipe straight back in', () => {
    expect(() => JSON.parse(JSON.stringify(scaffoldFor('plan')))).not.toThrow();
  });
});

describe('a refused payload names the field', () => {
  it('names the missing field rather than throwing where it is read', () => {
    const { state: _state, ...withoutState } = scaffoldFor('start') as Record<string, unknown>;

    expect(() => validateAgainstShape(withoutState, 'start'))
      .toThrow(/state/);
  });

  it('names a nested field by its path, not by its leaf', () => {
    const scaffold = scaffoldFor('start') as Record<string, unknown>;
    const state = { ...(scaffold['state'] as Record<string, unknown>) };
    delete state['base'];

    expect(() => validateAgainstShape({ ...scaffold, state }, 'start'))
      .toThrow(/state\.base/);
  });

  it('says where to obtain the field, because naming it is only half an answer', () => {
    const { tickets: _tickets, ...withoutTickets } = scaffoldFor('plan') as Record<string, unknown>;
    let message = '';
    try {
      validateAgainstShape(withoutTickets, 'plan');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/tracker|progress|order/i);
  });

  it('refuses a field of the wrong type instead of letting it fail later', () => {
    const plan = scaffoldFor('plan') as Record<string, unknown>;
    expect(() => validateAgainstShape({ ...plan, tickets: 'DEV-1' }, 'plan'))
      .toThrow(/tickets/);
  });

  it('accepts a payload that carries more than the shape declares', () => {
    // The tracker adds fields nobody asked for. Refusing them would make every
    // adapter upgrade a breaking change.
    const plan = scaffoldFor('plan') as Record<string, unknown>;
    expect(() => validateAgainstShape({ ...plan, extra: 1 }, 'plan'))
      .not.toThrow();
  });
  // The skill says the scaffold IS the contract. `reconcile` had none, which is
  // how a step whose refusal now stops a run stayed undocumented: its footprints
  // arrived from a prompt sentence rather than from a declared field.
  it('declares the reconcile observation, since reconcile refuses on its contents', () => {
    const scaffold = scaffoldFor('reconcile') as Record<string, unknown>;

    expect(Object.keys(scaffold)).toEqual(
      expect.arrayContaining(['clusterId', 'base', 'cluster', 'results', 'observations', 'footprints']),
    );
  });

  it('names the cluster in a reconcile observation that omits it', () => {
    const { cluster: _missing, ...withoutCluster } = scaffoldFor('reconcile') as Record<string, unknown>;

    expect(() => validateAgainstShape(withoutCluster, 'reconcile')).toThrow(/cluster/);
  });
});

describe('the taken list is validated entry by entry, against the merge journal', () => {
  // Four payloads the shape accepted on 2026-09-02, each contradicting `merged`
  // or itself in a way the set comparison downstream could not see. The chain
  // divides its budget by what `taken` holds, names its entries in the
  // disposition and subtracts their tickets from the pool, so an entry that is
  // wrong here is wrong three times later, silently.
  const SHA = 'a'.repeat(40);
  const journal = (tickets: readonly string[]) => ({
    tickets, integrationSha: SHA, mergeCommit: SHA, unionVerdict: 'clean', checks: [],
  });
  const chain = (over: Record<string, unknown>) => ({
    ...(scaffoldFor('chain') as Record<string, unknown>),
    ...over,
  });
  const refusal = (payload: unknown): { code: string; text: string } => {
    try {
      validateAgainstShape(payload, 'chain');
    } catch (error) {
      if (error instanceof AutopilotError) return { code: error.failure.code, text: error.message };
      throw error;
    }
    throw new Error('the payload was accepted');
  };

  it('refuses one merge journal entry split across two taken entries', () => {
    const refused = refusal(chain({
      merged: [journal(['DEV-1', 'DEV-2'])],
      taken: [
        { tickets: ['DEV-1'], outcome: 'merged' },
        { tickets: ['DEV-2'], outcome: 'merged' },
      ],
    }));

    expect(refused.code).toBe('AUTOPILOT_INPUT');
    expect(refused.text).toMatch(/merged\[0\]/);
    expect(refused.text).toMatch(/taken/);
  });

  it('refuses a taken entry with no ticket, which would count as a unit of nothing', () => {
    const refused = refusal(chain({ taken: [{ tickets: [], outcome: 'merged' }] }));

    expect(refused.code).toBe('AUTOPILOT_INPUT');
    expect(refused.text).toMatch(/taken\[0\]\.tickets/);
  });

  it('refuses a ticket listed in two taken entries, whatever their outcomes', () => {
    const refused = refusal(chain({
      merged: [journal(['DEV-1'])],
      taken: [
        { tickets: ['DEV-1'], outcome: 'merged' },
        { tickets: ['DEV-1'], outcome: 'published-awaiting-human' },
      ],
    }));

    expect(refused.code).toBe('AUTOPILOT_INPUT');
    expect(refused.text).toMatch(/taken\[1\]\.tickets/);
    expect(refused.text).toContain('DEV-1');
  });

  it('refuses an outcome that is none of the three, rather than reading it as a fourth', () => {
    const refused = refusal(chain({ taken: [{ tickets: ['DEV-1'], outcome: 'published' }] }));

    expect(refused.code).toBe('AUTOPILOT_INPUT');
    expect(refused.text).toMatch(/taken\[0\]\.outcome/);
    expect(refused.text).toMatch(/published-awaiting-human/);
  });

  it('accepts the nominal case: one taken entry per journal entry, same tickets', () => {
    expect(() => validateAgainstShape(chain({
      merged: [journal(['DEV-1', 'DEV-2'])],
      taken: [
        { tickets: ['DEV-2', 'DEV-1'], outcome: 'merged' },
        { tickets: ['DEV-3'], outcome: 'blocked' },
      ],
    }), 'chain')).not.toThrow();
  });
});

describe('the lease marker is obtainable without reading source', () => {
  // The gate for this slice is driving a run from scaffold output alone. The
  // marker was the one payload still requiring a source read: its delimiters
  // live in `linear-marker.ts` and appear in no output.
  it('shows the exact delimiters a ticket comment must carry', () => {
    const rendered = markerTemplate();

    expect(rendered).toContain(MARKER_BEGIN);
    expect(rendered).toContain(MARKER_END);
  });

  it('carries every field the marker validates, so a filled copy parses', () => {
    const rendered = markerTemplate();

    for (const field of ['programId', 'runId', 'clusterId', 'baseBranch', 'baseSha',
      'integrationBranch', 'expiresAt']) {
      expect(rendered, field).toContain(field);
    }
  });
});
