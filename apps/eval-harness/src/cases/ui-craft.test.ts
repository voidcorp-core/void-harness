import { describe, expect, it } from 'vitest';
import type { RunOutcome } from '../types.js';
import { UI_CRAFT_CASE } from './ui-craft.js';

function outcome(files: Record<string, string>): RunOutcome {
  return {
    ok: true,
    costUsd: 0,
    files,
    lastCommit: undefined,
    transcript: '',
  };
}

describe('UI craft behavioral case', () => {
  it('rejects the generic slop fixture deterministically', async () => {
    const score = await UI_CRAFT_CASE.scorer(outcome(UI_CRAFT_CASE.fixture as Record<string, string>));

    expect(score.score).toBeLessThan(0.5);
    expect(score.signals['avoidsGenericSlop']).toBe(false);
  });

  it('requires current mobile/desktop, state, test, and scored craft evidence', async () => {
    const evidence = {
      diffHash: `sha256:${'a'.repeat(64)}`,
      screenshots: [
        { viewport: 'mobile', state: 'default', diffHash: `sha256:${'a'.repeat(64)}` },
        { viewport: 'desktop', state: 'default', diffHash: `sha256:${'a'.repeat(64)}` },
        { viewport: 'mobile', state: 'error', diffHash: `sha256:${'a'.repeat(64)}` },
        { viewport: 'desktop', state: 'error', diffHash: `sha256:${'a'.repeat(64)}` },
      ],
      tests: [{ kind: 'keyboard', status: 'passed', diffHash: `sha256:${'a'.repeat(64)}` }],
      scores: {
        hierarchy: 8,
        'information-architecture': 9,
        'interaction-states': 8,
        'responsive-intent': 9,
        distinctiveness: 8,
        accessibility: 9,
      },
    };
    const score = await UI_CRAFT_CASE.scorer(outcome({
      'index.html': '<main><button>Primary action</button><p data-state="error">Try again</p></main>',
      'styles.css': '@media (max-width: 40rem) { main { padding: 1rem; } }\nbutton:focus-visible { outline: 2px solid; }',
      'artifacts/ui-quality.json': `${JSON.stringify(evidence)}\n`,
    }));

    expect(score.score).toBe(1);
    expect(score.signals).toMatchObject({
      avoidsGenericSlop: true,
      responsiveIntent: true,
      focusVisible: true,
      stateCoverage: true,
      deterministicEvidence: true,
      craftFloor: true,
    });
  });
});
