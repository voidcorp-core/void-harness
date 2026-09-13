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

  it('tests the packed document on a disposable runner and retains its review evidence', () => {
    const browser = job('browser-conformance');
    expect(browser).toContain('needs: consumer-artifact');
    expect(browser).toContain('runs-on: ubuntu-24.04');
    expect(browser).toContain('contents: read');
    expect(browser).toContain('persist-credentials: false');
    expect(browser).toContain('actions/download-artifact@');
    expect(browser).toContain('node test/browser/prepare.mjs');
    expect(browser).toContain('npm install --ignore-scripts --no-audit --no-fund --package-lock=false');
    expect(browser).toContain('node node_modules/@playwright/test/cli.js test');
    expect(browser).toContain('if: ${{ !cancelled() }}');
    expect(browser).toContain('actions/upload-artifact@');
    expect(browser).toContain('if-no-files-found: error');
    expect(browser).toContain('browser-evidence-${{ env.GATE_SHA }}');
    expect(browser).not.toContain('continue-on-error');
    expect(browser).not.toContain('pnpm conformance:pack');
    expect(browser).not.toContain('self-hosted');
  });
});
