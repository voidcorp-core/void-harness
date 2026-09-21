import { spawn as nodeSpawn } from 'node:child_process';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runClaudeNote } from '../src/application/runtime-note.js';

const fixture = fileURLToPath(new URL('./fixtures/claude-runtime-process.mjs', import.meta.url));

describe('real Claude note composition', () => {
  it('runs extraction then synthesis with separate configured models', async () => {
    const models: string[] = [];
    const schemas: Record<string, unknown>[] = [];
    const input = {
      requestId: 'request-1', question: 'Compare both sources',
      sources: [
        { sourceId: 'a', title: 'Alpha', text: 'alpha material' },
        { sourceId: 'b', title: 'Beta', text: 'beta material' },
      ],
    };
    const outcome = await runClaudeNote(input, {
      executable: execPath, cwd: '/tmp', extractionModel: 'fixture-extract',
      synthesisModel: 'fixture-synthesis', timeoutMs: 1000,
      spawn: (executable, args, options) => {
        const modelIndex = args.indexOf('--model');
        const model = modelIndex >= 0 ? args[modelIndex + 1] : '';
        models.push(model ?? '');
        const schemaIndex = args.indexOf('--json-schema');
        const schema = schemaIndex >= 0 ? args[schemaIndex + 1] : undefined;
        expect(typeof schema).toBe('string');
        schemas.push(JSON.parse(schema as string) as Record<string, unknown>);
        const mode = model === 'fixture-extract' ? 'extract' : 'synthesis';
        return nodeSpawn(executable, [fixture, mode, ...args], options) as never;
      },
    });
    expect(outcome).toMatchObject({ kind: 'completed', note: {
      title: 'Fixture note', evidence: [
        { sourceId: 'a', quote: 'alpha' }, { sourceId: 'b', quote: 'beta' },
      ],
    } });
    expect(models).toEqual(['fixture-extract', 'fixture-synthesis']);
    expect(schemas).toHaveLength(2);
    for (const schema of schemas) {
      expect(schema).toMatchObject({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
      });
    }
  });

  it('rejects invalid input without creating a runtime process', async () => {
    let starts = 0;
    const outcome = await runClaudeNote({ requestId: '', question: '', sources: [] }, {
      executable: execPath, cwd: '/tmp', extractionModel: 'fixture-extract',
      synthesisModel: 'fixture-synthesis', timeoutMs: 1000,
      spawn: () => { starts += 1; throw new Error('must not start'); },
    });
    expect(outcome).toMatchObject({ kind: 'stopped', stage: 'input' });
    expect(starts).toBe(0);
  });
});
