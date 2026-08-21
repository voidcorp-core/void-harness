import { describe, expect, it } from 'vitest';
import type { CheckResult } from './prerequisites.js';
import { judgeLayout, judgeProjectSkills, type LayoutObservation } from './void-hygiene.js';

function observation(over: Partial<LayoutObservation> = {}): LayoutObservation {
  return {
    pending: [],
    localIgnored: true,
    trackedObserved: [],
    trackedDerivedCount: 0,
    observedPaths: [],
    orphanedAssets: [],
    manifest: { kind: 'present', version: '2.5.1', drifted: 0 },
    ...over,
  };
}

function named(results: readonly CheckResult[], name: string): CheckResult | undefined {
  return results.find((result) => result.name === name);
}

describe('judgeLayout', () => {
  it('passes a project that keeps observed state out of its history', () => {
    expect(judgeLayout(observation()).every((check) => check.ok)).toBe(true);
  });

  it('reports state left at the old location, and points at the command that moves it', () => {
    const check = named(judgeLayout(observation({ pending: ['runs', 'activations.jsonl'] })), 'void layout');

    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('runs');
    expect(check?.fix).toContain('void-harness update');
  });

  it('does not confuse "no git" with "not ignored"', () => {
    // One is a project shipping telemetry; the other is a directory nobody
    // versions. Collapsing them either cries wolf or hides a real leak.
    const absent = named(judgeLayout(observation({ localIgnored: null })), 'void ignore');
    const notIgnored = named(judgeLayout(observation({ localIgnored: false })), 'void ignore');

    expect(absent?.status).toBe('unknown');
    expect(notIgnored?.status).toBe('fail');
  });

  it('treats an already-tracked observed path as its own failure', () => {
    // git ignores nothing it already tracks, so writing the block does not fix
    // this one — the fix has to be an explicit untrack.
    const check = named(judgeLayout(observation({ trackedObserved: ['.void/usage.log'] })), 'void tracked');

    expect(check?.status).toBe('fail');
    expect(check?.fix).toContain('git rm --cached');
    expect(check?.fix).toContain('.void/usage.log');
  });

  it('reports drift against the manifest as a failure, with the pinned command', () => {
    // The working tree claims a version it does not hold. That is not advisory.
    const check = named(
      judgeLayout(observation({ manifest: { kind: 'present', version: '2.5.1', drifted: 3 } })),
      'void manifest',
    );

    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('3 file(s)');
    expect(check?.fix).toBe('npx voidharness@2.5.1 hydrate — it restores and proves every file');
  });

  // `.void/PROJECT-DOCTRINE.md` is created once from a template and the project
  // is told to edit it freely. Counting that as drift failed `doctor` on the
  // intended use of the file, and named `hydrate` as the remedy -- which restores
  // nothing there, it re-stamps the hash over what the project wrote. A red
  // verdict nobody can extinguish is a red verdict everybody learns to skip past.
  it('passes when the only difference is a co-owned file the project wrote into', () => {
    const check = named(
      judgeLayout(observation({ manifest: { kind: 'present', version: '3.3.0', drifted: 0, coEdited: 2 } })),
      'void manifest',
    );

    expect(check?.status).toBe('pass');
    expect(check?.message).toContain('2 co-owned');
    expect(check?.fix).toBeUndefined();
  });

  it('still fails on real drift even when a co-owned file was also edited', () => {
    const check = named(
      judgeLayout(observation({ manifest: { kind: 'present', version: '3.3.0', drifted: 1, coEdited: 2 } })),
      'void manifest',
    );

    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('1 file(s)');
  });

  it('treats an absent manifest as advisory, not as a defect', () => {
    // A project runs fine without one; it just cannot prove another checkout got
    // the same bytes.
    const check = named(judgeLayout(observation({ manifest: { kind: 'absent' } })), 'void manifest');

    expect(check?.status).toBe('advisory');
    expect(check?.ok).toBe(true);
  });

  it('does not confuse a damaged manifest with a missing one', () => {
    const check = named(judgeLayout(observation({ manifest: { kind: 'unreadable' } })), 'void manifest');

    expect(check?.status).toBe('fail');
    expect(check?.fix).toContain('restore it from git');
  });

  it('reports tracked regenerated content as advisory, not as a failure', () => {
    // Nothing is broken by committing it, so calling it a failure would cry wolf.
    // But untracking rewrites the project's index, so it is offered, not done.
    const check = named(judgeLayout(observation({ trackedDerivedCount: 126 })), 'void derived');

    expect(check?.status).toBe('advisory');
    expect(check?.ok).toBe(true);
    expect(check?.message).toContain('126');
    expect(check?.fix).toContain('--untrack-derived');
  });

  it('stays silent when no regenerated content is tracked', () => {
    expect(named(judgeLayout(observation()), 'void derived')?.status).toBe('pass');
  });

  it('judges every observed write path, not only the one the block declares', () => {
    // `.void/machine/` being ignored says nothing about `.void/outputs/`, which
    // the published hook bundle writes to on every session. That gap is how an
    // untracked session log came within one `git add .` of being committed.
    const check = named(
      judgeLayout(
        observation({
          localIgnored: true,
          observedPaths: [{ path: '.void/outputs', present: true, ignored: false }],
        }),
      ),
      'void observed',
    );

    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('.void/outputs');
  });

  it('says the consequence, not just the state', () => {
    const check = named(judgeLayout(observation({ localIgnored: false })), 'void ignore');

    expect(check?.message).toMatch(/would be committed/);
  });
});

// A renamed skill kept because it was edited by hand goes on loading beside its
// replacement, and after the first update nothing mentions it again. Advisory
// rather than a failure: nothing is broken, the agent simply answers from
// whichever of the two doctrines it loads first.
describe('void orphans', () => {
  const orphans = (over: Partial<LayoutObservation> = {}): CheckResult =>
    judgeLayout(observation(over)).find((check) => check.name === 'void orphans') as CheckResult;

  it('passes quietly when the manifest still owns everything on disk', () => {
    expect(orphans().ok).toBe(true);
    expect(orphans().status).toBeUndefined();
  });

  it('names what still loads, and whose call it is to delete', () => {
    const check = orphans({ orphanedAssets: ['.claude/skills/ticket-runner/SKILL.md'] });
    expect(check.status).toBe('advisory');
    expect(check.message).toContain('ticket-runner');
    expect(check.fix).toContain('delete');
  });

  it('does not block, because the bytes were changed by hand and are not ours', () => {
    expect(orphans({ orphanedAssets: ['a', 'b'] }).ok).toBe(true);
  });
})

// Collapsing the ignore block to whole directories is only safe if the one thing
// it can silently swallow gets reported: a skill the project wrote by hand, in
// the same directory as the 41 the harness generates. It is ignored by default
// now, and losing it is losing work rather than a regenerable file.
describe('judgeProjectSkills', () => {
  it('passes when the project wrote none of its own', () => {
    expect(judgeProjectSkills([]).ok).toBe(true);
  });

  it('names each ignored skill and the exact line that rescues it', () => {
    const check = judgeProjectSkills(['.claude/skills/ma-skill', '.agents/skills/autre']);
    expect(check.ok).toBe(false);
    expect(check.message).toContain('ma-skill');
    expect(check.message).toContain('autre');
    expect(check.fix).toContain('!.claude/skills/ma-skill/');
  });

  it('is advisory, never a blocker: an ignored skill still loads at runtime', () => {
    expect(judgeProjectSkills(['.claude/skills/ma-skill']).status).toBe('advisory');
  });
});
