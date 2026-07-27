import { describe, expect, it } from 'vitest';
import type { RunOutcome } from '../types.js';
import { FRONTEND_TDD_CASE } from './frontend-tdd.js';

function outcome(files: Record<string, string>): RunOutcome {
  return {
    ok: true,
    costUsd: 0,
    files,
    lastCommit: undefined,
    transcript: '',
  };
}

describe('frontend TDD behavioral case', () => {
  it('rewards a role-first keyboard regression test rather than implementation alone', async () => {
    const score = await FRONTEND_TDD_CASE.scorer(outcome({
      'src/ActionMenu.test.tsx': [
        "import { render, screen } from '@testing-library/react';",
        "import userEvent from '@testing-library/user-event';",
        "import { ActionMenu } from './ActionMenu';",
        "test('opens from the keyboard', async () => {",
        '  render(<ActionMenu />);',
        "  await userEvent.keyboard('{Enter}');",
        "  expect(screen.getByRole('menu')).toBeVisible();",
        '});',
      ].join('\n'),
    }));

    expect(score.score).toBe(1);
    expect(score.signals).toEqual({
      testExists: true,
      targetsComponent: true,
      keyboardRegression: true,
      accessibleQuery: true,
    });
  });

  it('ships the broken interactive component as a committed fixture', () => {
    expect(FRONTEND_TDD_CASE.fixture['src/ActionMenu.tsx']).toContain('onClick');
    expect(FRONTEND_TDD_CASE.fixture['src/ActionMenu.tsx']).not.toContain('onKeyDown');
  });
});
