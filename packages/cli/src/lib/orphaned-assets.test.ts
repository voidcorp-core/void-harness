import { describe, expect, it } from 'vitest';
import { looksHarnessAuthored, orphanedAssets } from './orphaned-assets.js';

// A renamed skill that someone had edited by hand is preserved on update, which
// is right, and then goes on loading beside its replacement. `update` says so
// once; the run after that, the receipt no longer lists it and nothing mentions
// it again. The project carries two versions of its own doctrine and every check
// reports green.
//
// It cannot be found by absence: a skill the project wrote itself is equally
// absent from the manifest. It is found by provenance, because the harness's own
// assets are self-identifying.
describe('looksHarnessAuthored', () => {
  const shipped = [
    '---',
    'name: implement',
    'kind: action',
    'owner: folpe',
    'runtimes: [claude, codex]',
    'enforcement:',
    '  floor: ci',
    '---',
  ].join('\n');

  it('recognises a shipped skill by the frontmatter the harness writes', () => {
    expect(looksHarnessAuthored(shipped)).toBe(true);
  });

  // A project's own skill is a SKILL.md too. Nothing about being absent from the
  // manifest distinguishes it, which is why the signal has to be positive.
  it('does not claim a skill the project wrote itself', () => {
    const own = ['---', 'name: deploy-staging', 'description: our own thing', '---'].join('\n');
    expect(looksHarnessAuthored(own)).toBe(false);
  });

  it('needs more than one field, so a coincidence is not provenance', () => {
    expect(looksHarnessAuthored('---\nname: x\nkind: action\n---')).toBe(false);
  });

  it('says nothing about a file with no frontmatter at all', () => {
    expect(looksHarnessAuthored('# just a document')).toBe(false);
    expect(looksHarnessAuthored('')).toBe(false);
  });
});

describe('orphanedAssets', () => {
  const owned = new Set(['.claude/skills/implement/SKILL.md']);

  it('reports a harness-shaped asset the manifest does not own', () => {
    const found = orphanedAssets(
      [
        { path: '.claude/skills/ticket-runner/SKILL.md', harnessAuthored: true },
        { path: '.claude/skills/implement/SKILL.md', harnessAuthored: true },
      ],
      owned,
    );
    expect(found).toEqual(['.claude/skills/ticket-runner/SKILL.md']);
  });

  it('leaves an asset the project wrote alone, however absent from the manifest', () => {
    const found = orphanedAssets(
      [{ path: '.claude/skills/deploy-staging/SKILL.md', harnessAuthored: false }],
      owned,
    );
    expect(found).toEqual([]);
  });

  it('says nothing when everything on disk is owned', () => {
    expect(orphanedAssets([{ path: '.claude/skills/implement/SKILL.md', harnessAuthored: true }], owned))
      .toEqual([]);
  });

  it('reports in a stable order, so the same tree reads the same twice', () => {
    const found = orphanedAssets(
      [
        { path: 'b/SKILL.md', harnessAuthored: true },
        { path: 'a/SKILL.md', harnessAuthored: true },
      ],
      new Set(),
    );
    expect(found).toEqual(['a/SKILL.md', 'b/SKILL.md']);
  });
});
