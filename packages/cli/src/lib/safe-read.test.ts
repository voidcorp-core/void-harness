import { mkdir, mkdtemp, realpath, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBoundedProjectFile } from './safe-read.js';

function options(root: string, inputPath: string) {
  return {
    root,
    inputPath,
    maxBytes: 100,
    pathEscapeMessage: 'PATH_ESCAPE',
    invalidMessage: 'FILE_INVALID',
  } as const;
}

describe('readBoundedProjectFile', () => {
  it('reads a bounded regular file through its validated descriptor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-safe-read-'));
    await writeFile(join(root, 'ticket.md'), 'trusted');

    await expect(readBoundedProjectFile(options(root, 'ticket.md'))).resolves.toMatchObject({
      body: 'trusted',
      resolvedPath: await realpath(join(root, 'ticket.md')),
    });
  });

  it('rejects an initial symlink that resolves outside the project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-safe-read-'));
    const outside = await mkdtemp(join(tmpdir(), 'void-safe-read-outside-'));
    await writeFile(join(outside, 'secret.md'), 'outside');
    await symlink(join(outside, 'secret.md'), join(root, 'ticket.md'));

    await expect(readBoundedProjectFile(options(root, 'ticket.md'))).rejects.toThrow(
      'PATH_ESCAPE',
    );
  });

  it('rejects a final-file swap after the safe descriptor opens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-safe-read-'));
    const outside = await mkdtemp(join(tmpdir(), 'void-safe-read-outside-'));
    const ticket = join(root, 'ticket.md');
    await writeFile(ticket, 'trusted');
    await writeFile(join(outside, 'secret.md'), 'outside');

    await expect(readBoundedProjectFile(options(root, 'ticket.md'), async () => {
      await rename(ticket, join(root, 'ticket-original.md'));
      await symlink(join(outside, 'secret.md'), ticket);
    })).rejects.toThrow('FILE_INVALID');
  });

  it('rejects a parent-directory swap after the safe descriptor opens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-safe-read-'));
    const outside = await mkdtemp(join(tmpdir(), 'void-safe-read-outside-'));
    const directory = join(root, 'tickets');
    await mkdir(directory);
    await writeFile(join(directory, 'ticket.md'), 'trusted');
    await writeFile(join(outside, 'ticket.md'), 'outside');

    await expect(readBoundedProjectFile(options(root, 'tickets/ticket.md'), async () => {
      await rename(directory, join(root, 'tickets-original'));
      await symlink(outside, directory);
    })).rejects.toThrow('FILE_INVALID');
  });
});
