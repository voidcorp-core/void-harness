import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const workflow = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

function job(id: string): string {
  const start = workflow.indexOf(`  ${id}:\n`);
  if (start < 0) return '';
  const next = /^ {2}[a-z][a-z0-9-]+:\s*$/gm;
  next.lastIndex = start + id.length + 4;
  const match = next.exec(workflow);
  return workflow.slice(start, match?.index ?? workflow.length);
}

describe('packed consumer CI topology', () => {
  it('packs once and fans the same immutable artifact out to every operating system', () => {
    const producer = job('consumer-artifact');
    const consumers = job('install-conformance');
    expect(producer).not.toBe('');
    expect(consumers).toContain('needs: consumer-artifact');

    expect(producer.match(/conformance:pack/g) ?? []).toHaveLength(1);
    expect(producer).toContain('actions/upload-artifact@');
    expect(consumers).toContain('actions/download-artifact@');
    expect(consumers).toContain('conformance:consumer');
    expect(consumers).not.toContain('pnpm install');
    expect(consumers).not.toContain('pnpm pack');
  });

  it('prepares ProjectGraph workspace types before isolated test and typecheck steps', () => {
    const graph = job('project-graph-conformance');

    expect(graph).toContain('pnpm --filter "@voidcorp/harness-graph^..." build');
    expect(graph).toContain('name: ProjectGraph tests');
    expect(graph).toContain('name: ProjectGraph typecheck');
    expect(graph).not.toContain('name: ProjectGraph tests and typecheck');
  });
});
