import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('decision immutability workflow', () => {
  const workflow = readFileSync(
    new URL('../../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );

  it('fetches the PR base required by DECISIONS_BASE', () => {
    const validateJob = workflow.split('\n  validate:')[1];
    const checkoutStep = validateJob?.split('\n\n')[0];

    expect(validateJob).toBeDefined();
    expect(checkoutStep).toContain(
      'uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    );
    expect(checkoutStep).toContain('fetch-depth: 0');
  });
});
