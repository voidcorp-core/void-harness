import { describe, expect, it } from 'vitest';
import { executeSpecialist } from './process.js';

describe('specialist process execution', () => {
  it('preserves review identity while withholding unrelated parent environment', () => {
    const secretKey = 'VOID_EVAL_TEST_SECRET';
    const previous = process.env[secretKey];
    process.env[secretKey] = 'do-not-forward';
    try {
      const result = executeSpecialist(
        {
          command: process.execPath,
          args: [
            '-e',
            "process.stdout.write(JSON.stringify({ secret: 'VOID_EVAL_TEST_SECRET' in process.env }))",
          ],
        },
        process.cwd(),
        {
          specialistId: 'core:security-engineer',
          reviewRound: 2,
          inputHash: `sha256:${'a'.repeat(64)}`,
          correlationId: 'mis_eval_0001',
        },
        10_000,
      );

      expect(result.costUsd).toBe(0);
      expect(result.process).toMatchObject({
        specialistId: 'core:security-engineer',
        reviewRound: 2,
        correlationId: 'mis_eval_0001',
        exitCode: 0,
        timedOut: false,
        stdout: '{"secret":false}',
        stderr: '',
      });
    } finally {
      if (previous === undefined) delete process.env[secretKey];
      else process.env[secretKey] = previous;
    }
  });
});
