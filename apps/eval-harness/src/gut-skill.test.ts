import { describe, expect, it } from 'vitest';
import { gutSkill, skillBody } from './gut-skill.js';

const SKILL = `---
name: tdd
description: No production code without a failing test first. Conventional discipline etc.
---

# tdd — voidcorp edition

## The Iron Law

No production code without a failing test first.

## Modes

strict / souple / exploratory.
`;

describe('skillBody — what a loaded skill injects (the body, not the frontmatter)', () => {
  it('strips the YAML frontmatter and keeps the behavioral prose', () => {
    const body = skillBody(SKILL);
    // The frontmatter (incl. the description, which can leak the whole skill) is gone.
    expect(body).not.toContain('name: tdd');
    expect(body).not.toContain('description:');
    // The load-bearing prose stays.
    expect(body).toContain('# tdd');
    expect(body).toContain('Iron Law');
  });
});

describe('gutSkill — prose regression for the sensitivity check', () => {
  it('keeps only the H1 and drops every load-bearing section AND the frontmatter', () => {
    const gutted = gutSkill(SKILL);
    expect(gutted).toContain('# tdd');
    expect(gutted).not.toContain('name: tdd');
    expect(gutted).not.toContain('description:');
    expect(gutted).not.toContain('Iron Law');
    expect(gutted).not.toContain('failing test first');
  });

  it('is much shorter than the injected body (the prose is what was removed)', () => {
    expect(gutSkill(SKILL).length).toBeLessThan(skillBody(SKILL).length / 2);
  });
});
