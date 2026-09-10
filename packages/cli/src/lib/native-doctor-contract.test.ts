import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const launcher = resolve(HERE, '../../bin/void-machine.mjs');
const schema = resolve(HERE, '../../../../native/void-machine/schema/doctor-v1.json');

describe('native doctor compatibility boundary', () => {
  it('keeps the report schema closed and versioned', () => {
    const value = JSON.parse(readFileSync(schema, 'utf8')) as {
      additionalProperties?: boolean;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(value.additionalProperties).toBe(false);
    expect(value.properties?.schemaVersion).toEqual({ const: 1 });
    expect(value.required).toContain('findings');
  });

  it('fails fast with a schema-shaped blocked report when the native binary is absent', () => {
    let output = '';
    try {
      execFileSync(process.execPath, [launcher, 'doctor', '--json'], {
        env: { PATH: '/usr/bin:/bin', NODE_PATH: '' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const result = error as { status?: number; stdout?: string | Buffer };
      expect(result.status).toBe(1);
      output = String(result.stdout ?? '');
    }
    const report = JSON.parse(output) as { health?: string; findings?: Array<{ code?: string }> };
    expect(report.health).toBe('blocked');
    expect(report.findings?.[0]?.code).toBe('native.binary.absent');
  });
});

