import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installedVersion, resolveInstall } from './context-executor.js';

const project = async (): Promise<string> => mkdtemp(join(tmpdir(), 'void-install-'));

const withReceipt = async (root: string, body: unknown): Promise<void> => {
  await mkdir(join(root, '.void', 'receipts'), { recursive: true });
  await writeFile(join(root, '.void', 'receipts', 'install-v1.json'), JSON.stringify(body), 'utf8');
};

const withPlugin = async (pluginRoot: string, body: unknown): Promise<void> => {
  await mkdir(join(pluginRoot, '.claude-plugin'), { recursive: true });
  await writeFile(join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify(body), 'utf8');
};

describe('resolveInstall', () => {
  it('reads version and source from a local receipt', async () => {
    const root = await project();
    await withReceipt(root, { version: '2.1.0', source: 'local' });
    expect(resolveInstall(root, {})).toEqual({ version: '2.1.0', source: 'local' });
  });

  it('reports a marketplace receipt as such', async () => {
    const root = await project();
    await withReceipt(root, { version: '2.1.0', source: 'marketplace' });
    expect(resolveInstall(root, {})).toEqual({ version: '2.1.0', source: 'marketplace' });
  });

  it('treats a plugin-root install as a marketplace install', async () => {
    const root = await project();
    const pluginRoot = await project();
    await withPlugin(pluginRoot, { version: '0.17.0' });
    expect(resolveInstall(root, { CLAUDE_PLUGIN_ROOT: pluginRoot })).toEqual({
      version: '0.17.0',
      source: 'marketplace',
    });
  });

  it('leaves the source undetermined when an explicit version override is used', () => {
    expect(resolveInstall('/nowhere', { VOID_HARNESS_VERSION: '9.9.9' })).toEqual({
      version: '9.9.9',
      source: undefined,
    });
  });

  it('reports unknown with no source when nothing can be read', () => {
    expect(resolveInstall('/nowhere', {})).toEqual({ version: 'unknown', source: undefined });
  });

  it('ignores an unrecognised source value rather than trusting it', async () => {
    const root = await project();
    await withReceipt(root, { version: '2.1.0', source: 'curl-into-bash' });
    expect(resolveInstall(root, {})).toEqual({ version: '2.1.0', source: undefined });
  });
});

describe('installedVersion', () => {
  it('still answers with the version alone, unchanged for existing callers', async () => {
    const root = await project();
    await withReceipt(root, { version: '2.1.0', source: 'local' });
    expect(installedVersion(root, {})).toBe('2.1.0');
    expect(installedVersion('/nowhere', {})).toBe('unknown');
  });
});
