// @test-resource filesystem
import { describe, expect, it } from 'vitest';

describe('one package installation proof across runtime consumers', () => {
  it('installs the immutable package once and exercises all three isolated runtime roots', async () => {
    const { exerciseInstalledRuntimes } = await import('./conformance-install.mjs');
    let installations = 0;
    const exercises: string[] = [];
    const durations = await exerciseInstalledRuntimes(async () => {
      installations += 1;
      return '/package/node_modules/voidharness/bin/void-harness.mjs';
    }, async (bin: string, runtime: string) => {
      exercises.push(runtime);
      expect(bin).toBe('/package/node_modules/voidharness/bin/void-harness.mjs');
      return 12;
    });
    expect(installations).toBe(1);
    expect(exercises).toEqual(['claude', 'codex', 'both']);
    expect(durations).toEqual([12, 12, 12]);
  });

  it('does not install or execute later consumers after a failed runtime proof', async () => {
    const { exerciseInstalledRuntimes } = await import('./conformance-install.mjs');
    let installations = 0;
    const exercises: string[] = [];
    await expect(exerciseInstalledRuntimes(async () => {
      installations += 1;
      return '/package/bin';
    }, async (_bin: string, runtime: string) => {
      exercises.push(runtime);
      throw new Error('ownership mismatch');
    })).rejects.toThrow('ownership mismatch');
    expect(installations).toBe(1);
    expect(exercises).toEqual(['claude']);
  });
});
