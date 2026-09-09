import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');

describe('scheduled stress proof workflow', () => {
  it('runs exact-SHA seeded campaigns without retries and retains their reports', () => {
    const source = readFileSync(
      resolve(ROOT, '.github', 'workflows', 'test-certification.yml'),
      'utf8',
    );

    expect(source).toContain('schedule:');
    expect(source).toContain('scripts/stress-proof.mjs fast 20 10401');
    expect(source).toContain('scripts/stress-proof.mjs complete 10 20401');
    expect(source).toContain('actions/upload-artifact@');
    expect(source).toContain(['if: $', '{{ !cancelled() }}'].join(''));
    expect(source).not.toMatch(/retry|rerun/i);
  });
});
