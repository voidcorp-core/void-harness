import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git, setupSandbox } from '../sandbox.js';
import { createConsumerCellWorkspaceFactory } from './consumer-workspace.js';

describe('consumer cell workspace', () => {
  it('copies dependencies into a disposable checkout and keeps the source untouched', () => {
    const source = setupSandbox({
      'package.json': '{}\n',
      'node_modules/example/index.js': 'module.exports = 1;\n',
    });
    const workspace = createConsumerCellWorkspaceFactory({
      sourceCheckout: source.dir,
      parentDirectory: join(source.dir, '..'),
    }).create({ 'task.md': 'Complete the isolated task.\n' });

    expect(readFileSync(join(workspace.dir, 'node_modules/example/index.js'), 'utf8'))
      .toBe('module.exports = 1;\n');
    expect(lstatSync(join(workspace.dir, 'node_modules/example/index.js')).isSymbolicLink())
      .toBe(false);
    expect(git(workspace.dir, 'rev-parse', 'HEAD').trim()).toBe(workspace.baseSha);
    writeFileSync(join(workspace.dir, 'node_modules/example/index.js'), 'changed\n');
    expect(readFileSync(join(source.dir, 'node_modules/example/index.js'), 'utf8'))
      .toBe('module.exports = 1;\n');
    expect(workspace.diff()).toContain('node_modules/example/index.js');
    expect(workspace.cleanup().kind).toBe('complete');
    expect(workspace.cleanup().kind).toBe('complete');
  });

  it('rejects fixture paths that would alter dependency or lockfile state', () => {
    const source = setupSandbox({ 'package.json': '{}\n' });
    const factory = createConsumerCellWorkspaceFactory({ sourceCheckout: source.dir });

    expect(() => factory.create({ 'pnpm-lock.yaml': 'forbidden\n' })).toThrow('fixture path');
    expect(() => factory.create({ '../escape.md': 'forbidden\n' })).toThrow('fixture path');
  });
});
