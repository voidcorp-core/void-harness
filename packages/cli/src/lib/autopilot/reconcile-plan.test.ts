import { describe, expect, it } from 'vitest';
import type { RangeVerdict } from './git-observation.js';
import { buildReconcilePlan, type ReconcileInput, type VerifiedRange } from './reconcile-plan.js';

const BASE = '0000000000000000000000000000000000000001';
const H1 = '0000000000000000000000000000000000000011';
const H2 = '0000000000000000000000000000000000000012';

const usable = (commits: string[]): RangeVerdict => ({ kind: 'usable', commits });

function range(over: Partial<VerifiedRange> & { ticketId: string }): VerifiedRange {
  const files = over.files ?? [`src/${over.ticketId}.ts`];
  return {
    branch: `autopilot-worker/cluster-1/${over.ticketId}`,
    headSha: H1,
    verdict: usable([H1]),
    files,
    // Git's own reading, which every cluster of more than one ticket now
    // requires. Defaulted to the same paths so a fixture states them once.
    observedFiles: files,
    ...over,
  };
}

/** A range git was never read for, without writing `undefined` into the shape. */
function unobserved(over: Partial<VerifiedRange> & { ticketId: string }): VerifiedRange {
  const { observedFiles: _neverRead, ...rest } = range(over);
  return rest;
}

function input(over: Partial<ReconcileInput> = {}): ReconcileInput {
  const ranges = over.ranges ?? [
    range({ ticketId: 'DEV-1' }),
    range({ ticketId: 'DEV-2', headSha: H2, verdict: usable([H2]) }),
  ];
  return {
    clusterId: 'cluster-1',
    base: { branch: 'main', sha: BASE },
    ranges,
    // The cluster and its declaration are what the audit is about, so a fixture
    // that says nothing about them still declares them honestly: every ticket
    // that produced a range, each owning the file named after it.
    cluster: ranges.map((entry) => entry.ticketId),
    footprints: ranges.map((entry) => ({ id: entry.ticketId, areas: [`src/${entry.ticketId}.ts`] })),
    reconcileOnly: [],
    ...over,
  };
}

function kinds(plan: ReturnType<typeof buildReconcilePlan>): string[] {
  return plan.steps.map((step) => `${step.kind}${step.ticketId === null ? '' : `:${step.ticketId}`}`);
}

describe('buildReconcilePlan', () => {
  // Two shapes the module's own comments already claimed to handle. Both arrive
  // through JSON, where a declared type is a wish, and both used to leave as a
  // raw TypeError from wherever the value happened to be read -- which names
  // neither the field nor where to obtain it.
  it('refuses a range whose claimed file list is not a list of paths', () => {
    // The fallback the comment calls documented: a cluster of one, where the
    // worker's own claim is what the strip step reads. It still has to be a list.
    const [only] = [range({ ticketId: 'DEV-1' })];
    const broken = { ...(only as VerifiedRange), files: 'pnpm-lock.yaml' as unknown as string[] };
    const { observedFiles: _neverRead, ...withoutObservation } = broken;

    expect(() =>
      buildReconcilePlan(
        input({
          ranges: [withoutObservation as VerifiedRange],
          cluster: ['DEV-1'],
          footprints: [{ id: 'DEV-1', areas: ['src/DEV-1.ts'] }],
          reconcileOnly: ['pnpm-lock.yaml'],
        }),
      ),
    ).toThrow(/AUTOPILOT_CONTRACT[\s\S]*files/);
  });

  it('refuses a declaration whose areas are a string rather than a list', () => {
    expect(() =>
      buildReconcilePlan(
        input({
          footprints: [
            { id: 'DEV-1', areas: ['src/DEV-1.ts'] },
            { id: 'DEV-2', areas: 'src/DEV-2.ts' as unknown as string[] },
          ],
        }),
      ),
    ).toThrow(/AUTOPILOT_CONTRACT[\s\S]*DEV-2/);
  });

  it('creates the integration branch from the pinned base, then merges each range', () => {
    const plan = buildReconcilePlan(input());

    expect(plan.integrationBranch).toBe('autopilot/cluster-1');
    expect(kinds(plan)).toEqual(['create-branch', 'merge-range:DEV-1', 'merge-range:DEV-2']);
    expect(plan.steps[0]?.command).toEqual(['git', 'checkout', '-b', 'autopilot/cluster-1', BASE]);
  });

  it('branches from the base commit, never from the base branch name', () => {
    // The branch may have moved since the lease; every worker built on this tree.
    expect(buildReconcilePlan(input()).steps[0]?.command).toContain(BASE);
    expect(buildReconcilePlan(input()).steps[0]?.command).not.toContain('main');
  });

  it('merges with --no-ff so each ticket range stays identifiable in history', () => {
    const merge = buildReconcilePlan(input()).steps.find((step) => step.kind === 'merge-range');

    expect(merge?.command).toEqual(['git', 'merge', '--no-ff', '--no-edit', H1]);
  });

  it('integrates in the declared order, not in the order ranges were verified', () => {
    const plan = buildReconcilePlan(
      input({
        ranges: [
          range({ ticketId: 'DEV-9', headSha: H2, verdict: usable([H2]) }),
          range({ ticketId: 'DEV-4' }),
        ],
      }),
    );

    expect(plan.integrate).toEqual(['DEV-9', 'DEV-4']);
  });

  it('excludes a range whose ancestry was not proven, and says why', () => {
    const rejected: RangeVerdict = {
      kind: 'rejected',
      ticketId: 'DEV-2',
      reason: 'contains-merge',
      detail: '`DEV-2` includes merge commit abc',
    };
    const plan = buildReconcilePlan(
      input({ ranges: [range({ ticketId: 'DEV-1' }), range({ ticketId: 'DEV-2', verdict: rejected })] }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
    expect(plan.excluded).toEqual([
      { ticketId: 'DEV-2', reason: 'unverified-range', detail: '`DEV-2` includes merge commit abc' },
    ]);
    expect(kinds(plan)).not.toContain('merge-range:DEV-2');
  });

  it('excludes a verified range that carries no commit', () => {
    const plan = buildReconcilePlan(
      input({ ranges: [range({ ticketId: 'DEV-1' }), range({ ticketId: 'DEV-2', verdict: usable([]) })] }),
    );

    expect(plan.excluded).toEqual([
      expect.objectContaining({ ticketId: 'DEV-2', reason: 'no-usable-commit' }),
    ]);
  });

  it('still plans an integration when only one range survives', () => {
    const rejected: RangeVerdict = { kind: 'rejected', ticketId: 'DEV-2', reason: 'empty-range', detail: 'x' };
    const plan = buildReconcilePlan(
      input({ ranges: [range({ ticketId: 'DEV-1' }), range({ ticketId: 'DEV-2', verdict: rejected })] }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
    expect(kinds(plan)).toContain('merge-range:DEV-1');
  });

  it('plans no merge at all when nothing was verified', () => {
    const rejected: RangeVerdict = { kind: 'rejected', ticketId: 'x', reason: 'empty-range', detail: 'x' };
    const plan = buildReconcilePlan(
      input({ ranges: [range({ ticketId: 'DEV-1', verdict: rejected }), range({ ticketId: 'DEV-2', verdict: rejected })] }),
    );

    expect(plan.integrate).toEqual([]);
    expect(kinds(plan)).toEqual(['create-branch']);
  });

  it('strips a shared artefact from the worker ranges and rebuilds it once', () => {
    // Four workers each regenerating the same lockfile is four conflicts and
    // one wrong answer. The reconciler owns it.
    const plan = buildReconcilePlan(
      input({
        ranges: [
          range({ ticketId: 'DEV-1', files: ['src/a.ts', 'pnpm-lock.yaml'] }),
          range({ ticketId: 'DEV-2', headSha: H2, verdict: usable([H2]), files: ['src/b.ts', 'pnpm-lock.yaml'] }),
        ],
        reconcileOnly: ['pnpm-lock.yaml'],
        rebuildCommand: ['pnpm', 'install', '--lockfile-only'],
      }),
    );

    expect(plan.sharedPaths).toEqual(['pnpm-lock.yaml']);
    expect(kinds(plan)).toEqual([
      'create-branch',
      'merge-range:DEV-1',
      'merge-range:DEV-2',
      'strip-shared',
      'rebuild-shared',
      'commit-shared',
    ]);
  });

  it('reverts shared artefacts to the base before rebuilding, not to a worker version', () => {
    const plan = buildReconcilePlan(
      input({
        ranges: [range({ ticketId: 'DEV-1', files: ['pnpm-lock.yaml'] })],
        reconcileOnly: ['pnpm-lock.yaml'],
        rebuildCommand: ['pnpm', 'install'],
      }),
    );
    const strip = plan.steps.find((step) => step.kind === 'strip-shared');

    expect(strip?.command).toEqual(['git', 'checkout', BASE, '--', 'pnpm-lock.yaml']);
  });

  it('matches a shared directory by prefix', () => {
    const plan = buildReconcilePlan(
      input({
        ranges: [range({ ticketId: 'DEV-1', files: ['packages/cli/core-assets/data/model.json'] })],
        reconcileOnly: ['packages/cli/core-assets'],
        rebuildCommand: ['pnpm', 'build:assets'],
      }),
    );

    expect(plan.sharedPaths).toEqual(['packages/cli/core-assets/data/model.json']);
  });

  it('lists a shared path once even when several tickets touched it', () => {
    const plan = buildReconcilePlan(
      input({
        ranges: [
          range({ ticketId: 'DEV-1', files: ['pnpm-lock.yaml'] }),
          range({ ticketId: 'DEV-2', headSha: H2, verdict: usable([H2]), files: ['pnpm-lock.yaml'] }),
        ],
        reconcileOnly: ['pnpm-lock.yaml'],
        rebuildCommand: ['pnpm', 'install'],
      }),
    );

    expect(plan.sharedPaths).toEqual(['pnpm-lock.yaml']);
  });

  it('strips shared artefacts even with no rebuild command, rather than keeping a worker version', () => {
    const plan = buildReconcilePlan(
      input({
        ranges: [range({ ticketId: 'DEV-1', files: ['pnpm-lock.yaml'] })],
        reconcileOnly: ['pnpm-lock.yaml'],
      }),
    );

    expect(kinds(plan)).toContain('strip-shared');
    expect(kinds(plan)).not.toContain('rebuild-shared');
  });

  it('plans no shared step when no range touched a shared path', () => {
    const plan = buildReconcilePlan(input({ reconcileOnly: ['pnpm-lock.yaml'] }));

    expect(plan.sharedPaths).toEqual([]);
    expect(kinds(plan).some((kind) => kind.includes('shared'))).toBe(false);
  });

  it('gives every step a precondition the skill can check', () => {
    for (const step of buildReconcilePlan(input()).steps) {
      expect(step.precondition.length).toBeGreaterThan(0);
    }
  });

  it('emits argv only, so nothing is interpreted by a shell', () => {
    for (const step of buildReconcilePlan(input()).steps) {
      expect(Array.isArray(step.command)).toBe(true);
      expect(step.command.join(' ')).not.toMatch(/[;&|><$`]/);
    }
  });

  it('never plans a push, a pull request, or a merge of the base', () => {
    const serialized = JSON.stringify(buildReconcilePlan(input()));

    expect(serialized).not.toMatch(/push|gh pr|--auto|merge --ff-only main/);
  });

  it('rejects a cluster id that could escape the branch namespace', () => {
    expect(() => buildReconcilePlan(input({ clusterId: '../evil' }))).toThrow(/clusterId/);
  });

  it('rejects an empty cluster', () => {
    expect(() => buildReconcilePlan(input({ ranges: [] }))).toThrow(/reconcile/i);
  });
});

describe('buildReconcilePlan footprint audit', () => {
  const footprints = [
    { id: 'DEV-1', areas: ['src/DEV-1.ts'] },
    { id: 'DEV-2', areas: ['src/DEV-2.ts'] },
  ];

  /** A two-ticket cluster where only DEV-1 came back: the shape the audit is for. */
  const audited = (over: Partial<ReconcileInput> = {}): ReconcileInput =>
    input({ cluster: ['DEV-1', 'DEV-2'], footprints, ...over });

  it('integrates a range whose observed files stay inside its own declaration', () => {
    const plan = buildReconcilePlan(
      audited({ ranges: [range({ ticketId: 'DEV-1', observedFiles: ['src/DEV-1.ts'] })] }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
    expect(plan.excluded).toEqual([]);
  });

  it('integrates a range that widened into files nobody else claimed', () => {
    const plan = buildReconcilePlan(
      audited({ ranges: [range({ ticketId: 'DEV-1', observedFiles: ['src/DEV-1.ts', 'src/neighbour.ts'] })] }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
  });

  it('refuses a range carrying a file another ticket of the cluster declared', () => {
    const plan = buildReconcilePlan(
      audited({ ranges: [range({ ticketId: 'DEV-1', observedFiles: ['src/DEV-1.ts', 'src/DEV-2.ts'] })] }),
    );

    expect(plan.integrate).toEqual([]);
    expect(plan.excluded[0]?.reason).toBe('footprint-breach');
    expect(plan.excluded[0]?.detail).toContain('src/DEV-2.ts');
    expect(plan.excluded[0]?.detail).toContain('DEV-2');
    expect(kinds(plan)).toEqual(['create-branch']);
  });

  it('refuses a range git was never read for, because a worker claim is not an observation', () => {
    const plan = buildReconcilePlan(
      audited({ ranges: [unobserved({ ticketId: 'DEV-1' })] }),
    );

    expect(plan.excluded[0]?.reason).toBe('footprint-unobserved');
  });

  it('refuses to plan at all when a cluster of several declared no footprint', () => {
    // With no declaration there is no audit, no exclusion and no signal: the
    // plan comes back with an empty `excluded`, exactly as after a clean audit.
    // Nothing distinguished audited-and-clean from never-audited, so the guard
    // was off by default and silent about it.
    expect(() =>
      buildReconcilePlan(
        input({ cluster: ['DEV-1', 'DEV-2'], footprints: [], ranges: [range({ ticketId: 'DEV-1' })] }),
      ),
    ).toThrow(/declared no footprint|DEV-1, DEV-2/);
  });

  it('names the cluster tickets whose declaration is missing', () => {
    expect(() =>
      buildReconcilePlan(
        audited({ cluster: ['DEV-1', 'DEV-2', 'DEV-3'], ranges: [range({ ticketId: 'DEV-1' })] }),
      ),
    ).toThrow(/DEV-3/);
  });

  it('refuses a declaration naming a ticket the cluster says it never reserved', () => {
    // The switch read `cluster` alone, and the cross-check ran one way only:
    // every cluster ticket needed a footprint, no footprint needed a cluster
    // ticket. So a caller passing the tickets that CAME BACK instead of the ones
    // the run reserved turned the audit off, with the neighbour's declaration
    // sitting unread in the same payload -- and a range carrying that
    // neighbour's file came back `excluded: []`, byte for byte a clean audit.
    expect(() =>
      buildReconcilePlan(
        input({
          cluster: ['DEV-1'],
          footprints,
          ranges: [range({ ticketId: 'DEV-1', observedFiles: ['src/DEV-2.ts'] })],
        }),
      ),
    ).toThrow(/DEV-2/);
  });

  it('refuses a cluster ticket whose declaration names no area at all', () => {
    // An empty list is the same silence as a missing entry: nothing can be
    // stolen from a ticket that claims nothing, so admitting it into an audited
    // cluster hands its neighbours a free pass into its ground.
    expect(() =>
      buildReconcilePlan(
        audited({
          footprints: [{ id: 'DEV-1', areas: ['src/DEV-1.ts'] }, { id: 'DEV-2', areas: [] }],
          ranges: [range({ ticketId: 'DEV-1' })],
        }),
      ),
    ).toThrow(/DEV-2/);
  });

  it('names a repair for an undeclared ticket rather than asking for the same payload again', () => {
    // `orchestrate` emits `areas: []` verbatim, so "pass `footprints` exactly as
    // `orchestrate` returned them" named the gesture that had just succeeded. At
    // the last step of a run whose workers all finished, a fix line that asks
    // for the payload again is a dead end: the two remaining moves were
    // inventing an area, which the whole audit exists to forbid, and shrinking
    // `cluster`, which `requireClusterCoversRun` refuses. `plan` now excludes
    // such a ticket before any worker starts, and this stays the backstop for a
    // hand-built payload -- so it has to say what a caller can actually do.
    const undeclared = (): void => {
      buildReconcilePlan(
        audited({
          footprints: [{ id: 'DEV-1', areas: ['src/DEV-1.ts'] }, { id: 'DEV-2', areas: [] }],
          ranges: [range({ ticketId: 'DEV-1' })],
        }),
      );
    };
    const absent = (): void => {
      buildReconcilePlan(
        audited({ footprints: [{ id: 'DEV-1', areas: ['src/DEV-1.ts'] }], ranges: [range({ ticketId: 'DEV-1' })] }),
      );
    };

    let undeclaredMessage = '';
    let absentMessage = '';
    try {
      undeclared();
    } catch (error) {
      undeclaredMessage = error instanceof Error ? error.message : String(error);
    }
    try {
      absent();
    } catch (error) {
      absentMessage = error instanceof Error ? error.message : String(error);
    }

    // A declaration that arrived and named nothing is not a declaration that
    // never arrived, and the two repairs are different gestures.
    expect(undeclaredMessage).toMatch(/declared `areas: \[\]`/);
    expect(undeclaredMessage).toMatch(/declare the areas on the ticket/);
    expect(undeclaredMessage).not.toMatch(/exactly as `orchestrate` returned them/);
    expect(absentMessage).toMatch(/exactly as `orchestrate` returned them/);
    expect(absentMessage).not.toMatch(/declare the areas on the ticket/);
  });

  it('does not answer `areas: []` with the split that turns the audit off', () => {
    // The refusal used to close with: reconcile each range as its own cluster
    // of one, "exactly the coverage a ticket claiming nothing ever had". The
    // second half is what makes the first look free, and it is false. A ticket
    // declaring nothing IS audited at maximum severity -- it owns nothing, so
    // every file it carries is a neighbour's or a widening -- but only because
    // the neighbour sits in the SAME cluster. Split into ranges of one,
    // `audited` is false for every range, the declaring ones included.
    const footprints = [
      { id: 'DEV-1', areas: ['packages/cli'] },
      { id: 'DEV-2', areas: [] },
    ];
    // DEV-2 declares nothing and carries a file DEV-1 declared.
    const stealing = range({ ticketId: 'DEV-2', files: ['packages/cli/a.ts'] });

    let refusal = '';
    try {
      buildReconcilePlan(input({ cluster: ['DEV-1', 'DEV-2'], footprints, ranges: [stealing] }));
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    expect(refusal).toMatch(/AUTOPILOT_CONTRACT/);

    // The old Fix line's own instruction, executed: the theft merges, and the
    // plan reports it as an ordinary clean integration.
    const split = buildReconcilePlan(
      input({ cluster: ['DEV-2'], footprints: [], ranges: [stealing] }),
    );
    expect(split.integrate).toEqual(['DEV-2']);
    expect(split.excluded).toEqual([]);

    // So the refusal names neither that move nor the coverage claim behind it.
    expect(refusal).not.toMatch(/reconcile each range as its own cluster of one/);
    expect(refusal).not.toMatch(/exactly the coverage/);
    expect(refusal).toMatch(/turns the audit off for every ticket of the cluster/);
  });

  it('refuses a range whose observed files arrived as a string rather than a list', () => {
    // `length` on a string is a character count, and `for...of` walks
    // characters: every one of them matched no area, so the verdict was
    // `within-scope` and the range integrated. The type says otherwise, but the
    // payload crosses a JSON boundary where the type is a wish.
    const plan = buildReconcilePlan(
      audited({
        ranges: [
          range({
            ticketId: 'DEV-1',
            observedFiles: 'src/DEV-2.ts' as unknown as readonly string[],
          }),
        ],
      }),
    );

    expect(plan.integrate).toEqual([]);
    expect(plan.excluded[0]?.reason).toBe('footprint-unobserved');
  });

  it('refuses a range whose observed list carries something that is not a path', () => {
    const plan = buildReconcilePlan(
      audited({
        ranges: [
          range({
            ticketId: 'DEV-1',
            observedFiles: ['src/DEV-1.ts', ''] as unknown as readonly string[],
          }),
        ],
      }),
    );

    expect(plan.integrate).toEqual([]);
    expect(plan.excluded[0]?.reason).toBe('footprint-unobserved');
  });

  it('audits nothing for a cluster of one, because no other ticket can be robbed', () => {
    // The audit only ever answers "does this belong to somebody else". Alone,
    // there is no somebody else, and demanding an observation to answer nothing
    // would stall a run for ceremony.
    const plan = buildReconcilePlan(
      input({ cluster: ['DEV-1'], footprints: [], ranges: [unobserved({ ticketId: 'DEV-1' })] }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
    expect(plan.excluded).toEqual([]);
  });

  it('refuses a range whose observed file list is empty though it carries commits', () => {
    // A commit that changed no file is not a thing git produces here. An empty
    // list is an incoherent observation, and accepting it passes the audit
    // trivially -- the same silence as never observing at all.
    const plan = buildReconcilePlan(
      audited({ ranges: [range({ ticketId: 'DEV-1', observedFiles: [] })] }),
    );

    expect(plan.integrate).toEqual([]);
    expect(plan.excluded[0]?.reason).toBe('footprint-unobserved');
  });

  it('does not refuse over a path the reconciler strips and rebuilds itself', () => {
    const plan = buildReconcilePlan(
      audited({
        ranges: [range({ ticketId: 'DEV-1', observedFiles: ['src/DEV-1.ts', 'pnpm-lock.yaml'] })],
        footprints: [...footprints, { id: 'DEV-2', areas: ['pnpm-lock.yaml'] }],
        reconcileOnly: ['pnpm-lock.yaml'],
      }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
    expect(plan.sharedPaths).toEqual(['pnpm-lock.yaml']);
  });

  it('detects a shared artefact from git rather than from the worker report', () => {
    const plan = buildReconcilePlan(
      input({
        ranges: [range({ ticketId: 'DEV-1', files: [], observedFiles: ['pnpm-lock.yaml'] })],
        reconcileOnly: ['pnpm-lock.yaml'],
      }),
    );

    expect(plan.sharedPaths).toEqual(['pnpm-lock.yaml']);
  });
  it('strips a reconcileOnly path written with a trailing slash', () => {
    // The strip step and the audit exemption read one list. A spelling that
    // disarms one has to disarm the other, or the two disagree about which
    // files the reconciler owns.
    const plan = buildReconcilePlan(
      audited({
        ranges: [range({ ticketId: 'DEV-1', observedFiles: ['src/DEV-1.ts', 'packages/core/data/model.json'] })],
        reconcileOnly: ['packages/core/data/'],
      }),
    );

    expect(plan.integrate).toEqual(['DEV-1']);
    expect(plan.sharedPaths).toEqual(['packages/core/data/model.json']);
  });
});
