import { describe, expect, it } from 'vitest';
import { danglingReferences, extractReferences } from '../../scripts/check-skill-references.mjs';

// A skill's identity is its directory name, and that name is copied by hand into
// routing tables, commands, sourcing notes and hooks. Renaming `session-handoff`
// to `checkpoint` left four references pointing at a skill that no longer
// existed, and an audit found them weeks later rather than the build. On its
// first run this check found two more, in files shipped to every consumer.
describe('extractReferences', () => {
  it('reads the canonical harness:<name> form', () => {
    expect(extractReferences('route it to `harness:tdd` first')).toEqual(['tdd']);
  });

  it('reads several references from one line, without duplicates', () => {
    expect(extractReferences('harness:tdd then harness:qa then harness:tdd')).toEqual(['qa', 'tdd']);
  });

  it('accepts the slash-command spelling', () => {
    expect(extractReferences('run /harness:autopilot now')).toEqual(['autopilot']);
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

  // The prefix is the routing spelling: it means "go here". A sourcing note that
  // records a retired predecessor names it in prose, which is what lets history
  // stay written without pointing anywhere.
  it('reads only the routing spelling, so prose about a retired skill is free', () => {
    expect(extractReferences('the former backlog-autopilot skill, retired in July')).toEqual([]);
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
