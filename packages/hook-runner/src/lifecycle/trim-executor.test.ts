import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeTrim } from './trim-executor.js';

const output = (bytes: number) => ({
  tool_name: 'Bash',
  tool_input: { command: 'cat big' },
  tool_response: { stdout: 'x'.repeat(bytes), stderr: '' },
});
const root = () => mkdtempSync(join(tmpdir(), 'void-trim-'));

describe('executeTrim settings', () => {
  it('is turned off under the current prefix and under the deprecated one', () => {
    expect(executeTrim(output(50_000), root(), { VOID_MACHINE_NO_TRIM: '1' }).details).toEqual({ reason: 'disabled' });
    expect(executeTrim(output(50_000), root(), { VOID_HARNESS_NO_TRIM: '1' }).details).toEqual({ reason: 'disabled' });
  });

  it('is not turned off by a stale deprecated value the current name overrides', () => {
    const result = executeTrim(output(50_000), root(), { VOID_MACHINE_NO_TRIM: '0', VOID_HARNESS_NO_TRIM: '1' });
    expect(result.details).not.toEqual({ reason: 'disabled' });
  });

  it('reads the threshold under the current prefix before the deprecated one', () => {
    const env = { VOID_HARNESS_TRIM_BYTES: '100', VOID_MACHINE_TRIM_BYTES: '5000' };
    expect(executeTrim(output(2_000), root(), env).details).toEqual({ reason: 'below-threshold' });
    expect(executeTrim(output(2_000), root(), { VOID_HARNESS_TRIM_BYTES: '100' }).details)
      .not.toEqual({ reason: 'below-threshold' });
  });
});
