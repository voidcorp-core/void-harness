import { describe, expect, it } from 'vitest';
import { auditFootprint, type DeclaredFootprint, type FootprintAuditInput } from './footprint-audit.js';

const cluster: readonly DeclaredFootprint[] = [
  { id: 'DEV-526', areas: ['packages/*/vitest.config.ts'] },
  { id: 'DEV-649', areas: ['packages/core/templates/PROJECT-DOCTRINE.md'] },
];

function input(over: Partial<FootprintAuditInput> = {}): FootprintAuditInput {
  return { footprints: cluster, exempt: [], ...over };
}

describe('auditFootprint', () => {
  it('accepts a range that stays inside what its ticket declared', () => {
    const verdict = auditFootprint(
      { ticketId: 'DEV-526', files: ['packages/cli/vitest.config.ts', 'packages/core/vitest.config.ts'] },
      input(),
    );

    expect(verdict.kind).toBe('within-scope');
  });

  it('accepts a widening nobody else claimed, and names it', () => {
    // DEV-526 legitimately grew from three configs to six: enumerating from the
    // manifests revealed three more packages with the identical defect. A guard
    // that refuses an unforeseen file refuses the discovery that makes the fix
    // complete, which is how the original defect stayed hidden.
    const verdict = auditFootprint(
      { ticketId: 'DEV-526', files: ['packages/cli/vitest.config.ts', 'packages/harness-graph/vitest.config.ts'] },
      input({ footprints: [{ id: 'DEV-526', areas: ['packages/cli/vitest.config.ts'] }] }),
    );

    expect(verdict).toEqual({ kind: 'within-scope', widened: ['packages/harness-graph/vitest.config.ts'] });
  });

  it('refuses a file another ticket of the cluster claimed, naming file and claimant', () => {
    const verdict = auditFootprint(
      {
        ticketId: 'DEV-526',
        files: ['packages/cli/vitest.config.ts', 'packages/core/templates/PROJECT-DOCTRINE.md'],
      },
      input(),
    );

    expect(verdict.kind).toBe('breach');
    if (verdict.kind !== 'breach') return;
    expect(verdict.intrusions).toEqual([
      { file: 'packages/core/templates/PROJECT-DOCTRINE.md', claimedBy: ['DEV-649'] },
    ]);
    expect(verdict.detail).toContain('packages/core/templates/PROJECT-DOCTRINE.md');
    expect(verdict.detail).toContain('DEV-649');
  });

  it('lets a file both tickets declared through, because both were entitled to it', () => {
    // Two tickets declaring the same area collide, and `orderWorkers` sequences
    // them for exactly that reason. Refusing here would refuse a collision the
    // ordering step already resolved.
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/cli/src/lib/shared.ts'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src/lib/shared.ts'] },
          { id: 'DEV-2', areas: ['packages/cli/src/lib/shared.ts'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('within-scope');
  });

  it('reads a declared directory as claiming everything under it', () => {
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/core/skills/void-autopilot/SKILL.md'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-2', areas: ['packages/core/skills'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('breach');
    if (verdict.kind !== 'breach') return;
    expect(verdict.intrusions[0]?.claimedBy).toEqual(['DEV-2']);
  });

  it('ignores a path the reconciler owns, since no worker keeps it anyway', () => {
    // A shared artefact is stripped from every range and rebuilt once. Refusing
    // a range over a file the plan is about to revert would stop a merge for a
    // change that never reaches the integration branch.
    const verdict = auditFootprint(
      { ticketId: 'DEV-526', files: ['pnpm-lock.yaml'] },
      input({
        footprints: [
          { id: 'DEV-526', areas: ['packages/cli/vitest.config.ts'] },
          { id: 'DEV-649', areas: ['pnpm-lock.yaml'] },
        ],
        exempt: ['pnpm-lock.yaml'],
      }),
    );

    expect(verdict.kind).toBe('within-scope');
  });

  it('exempts only what the strip step would strip, never a glob it would keep', () => {
    // `buildReconcilePlan` strips a `reconcileOnly` path literally. An audit
    // that exempted a glob would clear a file the merge then keeps.
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/cli/vitest.config.ts'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['docs'] },
          { id: 'DEV-2', areas: ['packages/cli/vitest.config.ts'] },
        ],
        exempt: ['packages/*/vitest.config.ts'],
      }),
    );

    expect(verdict.kind).toBe('breach');
  });

  it('refuses on behalf of a ticket that never ran, because the claim is what counts', () => {
    // The other worker may have been excluded, blocked, or never spawned. What
    // makes the file foreign is that another ticket of the cluster declared it,
    // not that a branch also touched it.
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/core/templates/PROJECT-DOCTRINE.md'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-649', areas: ['packages/core/templates/PROJECT-DOCTRINE.md'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('breach');
  });

  it('refuses everything foreign for a ticket that declared nothing', () => {
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/core/templates/PROJECT-DOCTRINE.md', 'README.md'] },
      input({ footprints: [{ id: 'DEV-1', areas: [] }, ...cluster] }),
    );

    expect(verdict.kind).toBe('breach');
    if (verdict.kind !== 'breach') return;
    expect(verdict.intrusions.map((entry) => entry.file)).toEqual([
      'packages/core/templates/PROJECT-DOCTRINE.md',
    ]);
  });

  it('names every claimant when more than one ticket declared the same file', () => {
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/cli/src/lib/shared.ts'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['docs'] },
          { id: 'DEV-2', areas: ['packages/cli/src/lib/shared.ts'] },
          { id: 'DEV-3', areas: ['packages/cli/src/lib'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('breach');
    if (verdict.kind !== 'breach') return;
    expect(verdict.intrusions[0]?.claimedBy).toEqual(['DEV-2', 'DEV-3']);
  });

  it('reports every intrusion, not just the first', () => {
    const verdict = auditFootprint(
      {
        ticketId: 'DEV-1',
        files: ['a/one.ts', 'b/two.ts', 'c/three.ts'],
      },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['c'] },
          { id: 'DEV-2', areas: ['a', 'b'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('breach');
    if (verdict.kind !== 'breach') return;
    expect(verdict.intrusions.map((entry) => entry.file)).toEqual(['a/one.ts', 'b/two.ts']);
  });

  it('accepts a range whose ticket is not in the cluster footprints at all', () => {
    // Nothing was declared for it, so nothing entitles or forbids anything; the
    // audit only ever answers "does this belong to somebody else".
    const verdict = auditFootprint(
      { ticketId: 'DEV-9', files: ['docs/README.md'] },
      input({ footprints: [{ id: 'DEV-1', areas: ['packages/cli/src'] }] }),
    );

    expect(verdict.kind).toBe('within-scope');
  });
  it('reads a declared glob as claiming the files it matches', () => {
    // The third documented form, and the one no other test exercises: without
    // it DEV-526 owns none of the configs it declared, and the neighbouring
    // directory claim turns its own work into a breach.
    const verdict = auditFootprint(
      { ticketId: 'DEV-526', files: ['packages/cli/vitest.config.ts'] },
      input({
        footprints: [
          { id: 'DEV-526', areas: ['packages/*/vitest.config.ts'] },
          { id: 'DEV-2', areas: ['packages/cli'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('within-scope');
  });

  it('reads a directory written with a trailing slash as the directory it is', () => {
    // The most natural way to write a directory in a path list. Left unnormalised
    // it claims nothing at all, so the stolen file below is reported as a
    // widening -- that is, as approval -- by the guard meant to refuse it.
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/core/templates/stolen.md'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-2', areas: ['packages/core/templates/'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('breach');
  });

  it('reads a path written with a leading ./ as the path it is', () => {
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/core/templates/stolen.md'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-2', areas: ['./packages/core/templates'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('breach');
  });

  it('lets a ticket own its own area when it wrote it with a trailing slash', () => {
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/cli/src/lib/x.ts'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src/'] },
          { id: 'DEV-2', areas: ['packages/cli'] },
        ],
      }),
    );

    expect(verdict.kind).toBe('within-scope');
  });

  it('exempts a reconcileOnly path written with a trailing slash', () => {
    // The exemption and the strip step read the same list; a trailing slash that
    // disarms one has to disarm the other, or the audit clears a file the merge
    // keeps -- or refuses one the merge is about to revert.
    const verdict = auditFootprint(
      { ticketId: 'DEV-1', files: ['packages/core/data/model.json'] },
      input({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-2', areas: ['packages/core/data'] },
        ],
        exempt: ['packages/core/data/'],
      }),
    );

    expect(verdict.kind).toBe('within-scope');
  });

  it('refuses an area that claims nothing, rather than reading it as no claim', () => {
    // An absolute path, or one that normalises to nothing, matches no file git
    // ever reports. Silently claiming nothing is exactly the failure the
    // trailing slash produced; refusing is loud and names the area.
    expect(() =>
      auditFootprint(
        { ticketId: 'DEV-1', files: ['a.ts'] },
        input({ footprints: [{ id: 'DEV-1', areas: ['/packages/cli/src'] }] }),
      ),
    ).toThrow(/claims nothing/i);
  });
});
