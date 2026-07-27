import { describe, expect, it } from 'vitest';
import { CASES } from './cases.js';
import { MISSION_TEAM_CASE } from './cases/mission-team.js';

describe('eval case registry', () => {
  it('keeps the mission-team suite addressable without dropping pilot cases', () => {
    expect(CASES['mission-team']).toBe(MISSION_TEAM_CASE);
    expect(Object.keys(CASES)).toEqual([
      'commit-discipline',
      'tdd',
      'brainstorming',
      'security-audit',
      'frontend-tdd',
      'ui-craft',
      'mission-team',
    ]);
  });

  it('registers every case under a non-empty skill and fixture', () => {
    for (const evalCase of Object.values(CASES)) {
      expect(evalCase.skill).not.toBe('');
      expect(Object.keys(evalCase.fixture).length).toBeGreaterThan(0);
    }
  });
});
