import { describe, expect, it } from 'vitest';
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
