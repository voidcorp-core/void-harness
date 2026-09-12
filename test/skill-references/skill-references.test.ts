import { describe, expect, it } from 'vitest';
import { danglingReferences, extractPluginReferences, extractReferences } from '../../scripts/check-skill-references.mjs';

describe('plugin description references', () => {
  it('resolves explicit skill names without guessing the meaning of ordinary words', () => {
    expect(extractPluginReferences('plan context testing functional harness-react void-harness void-tdd'))
      .toEqual(['void-tdd']);
  });

  it('retains unknown and retired explicit names for catalogue validation', () => {
    expect(extractPluginReferences('void-does-not-exist void-compounding void-does-not-exist'))
      .toEqual(['void-compounding', 'void-does-not-exist']);
  });

  it('shares identifier boundaries and exempts only the exact product name', () => {
    expect(extractPluginReferences('_void-tdd custom-void-tdd void-harness-extra'))
      .toEqual(['void-harness-extra']);
  });

  it('accepts empty or missing descriptions', () => {
    expect(extractPluginReferences('')).toEqual([]);
    expect(extractPluginReferences(undefined)).toEqual([]);
  });
});

// A skill's identity is its directory name, and that name is copied by hand into
// routing tables, commands, sourcing notes and hooks. Renaming `session-handoff`
// to `checkpoint` left four references pointing at a skill that no longer
// existed, and an audit found them weeks later rather than the build. On its
// first run this check found two more, in files shipped to every consumer.
describe('extractReferences', () => {
  it('reports the namespaced spelling, which no local install resolves', () => {
    expect(extractReferences('route it to `harness:tdd` first')).toEqual(['tdd']);
  });

  it('reads several on one line, without duplicates', () => {
    expect(extractReferences('harness:tdd then harness:qa then harness:tdd')).toEqual(['qa', 'tdd']);
  });

  it('reports the slash-command spelling too', () => {
    expect(extractReferences('run /harness:autopilot now')).toEqual(['autopilot']);
  });

  // A pack namespace fails exactly the same way: `stageSkills` lands every pack
  // skill flat in `.claude/skills/`, so `harness-server:server-action` resolves
  // to nothing while `server-action` does.
  it('reports a pack namespace, which lands flat like every other skill', () => {
    expect(extractReferences('see `harness-server:server-action`')).toEqual(['server-action']);
  });

  // `void-harness:begin` and `void-harness:end` delimit the managed block in
  // every consumer's CLAUDE.md, and `void-harness:mission` names an event
  // producer. None of them names a skill, and all three contain `harness:`.
  it('ignores the void-harness: prefix, which is a marker and not a reference', () => {
    const text = '<!-- void-harness:begin --> x <!-- void-harness:end --> void-harness:mission';
    expect(extractReferences(text)).toEqual([]);
  });

  it('ignores a name that runs into other words', () => {
    expect(extractReferences('harness:')).toEqual([]);
  });

  // The bare name is the written form now, and it is not a routing spelling: a
  // sourcing note naming a retired predecessor stays prose and points nowhere.
  it('says nothing about a bare name, which is the correct written form', () => {
    expect(extractReferences('compose `tdd` and `testing`, never the former backlog-autopilot')).toEqual([]);
  });
});

describe('danglingReferences', () => {
  const known = new Set(['tdd', 'checkpoint', 'doctrine-critic']);

  it('reports a reference that resolves to nothing', () => {
    expect(danglingReferences(['tdd', 'session-handoff'], known)).toEqual(['session-handoff']);
  });

  it('says nothing when every reference resolves', () => {
    expect(danglingReferences(['tdd', 'checkpoint'], known)).toEqual([]);
  });

  // Agents share the spelling with skills, and the catalogue holds both, so
  // splitting them would report every agent as dangling.
  it('resolves an agent name like any other', () => {
    expect(danglingReferences(['doctrine-critic'], known)).toEqual([]);
  });

  it('reports each missing name once, in a stable order', () => {
    expect(danglingReferences(['b', 'a', 'b'], known)).toEqual(['a', 'b']);
  });
});
