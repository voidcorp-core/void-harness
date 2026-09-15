import { join } from 'node:path';
import type { ProjectRoots } from '@voidcorp/hook-runner';
export { type ProjectRoots, resolveProjectRoots } from '@voidcorp/hook-runner';

/**
 * What a printed remedy is prefixed with. Every remedy is a command that acts
 * on the directory it is typed in, so from a linked worktree it names the
 * installation, or following it installs a second copy exactly where git was
 * told not to look. Where the two roots coincide it names nothing.
 */
export function remedyPrefix(roots: ProjectRoots): string {
  return roots.workRoot === roots.installRoot ? '' : `in ${roots.installRoot}: `;
}

/**
 * How a file written under the installation is named. A printed path is read
 * against the directory the command was typed in, so from a linked worktree the
 * file is named in full, or the reader looks for it where git was told not to
 * put it. Where the two roots coincide it stays relative.
 */
export function installedPath(roots: ProjectRoots, relative: string): string {
  return roots.workRoot === roots.installRoot ? relative : join(roots.installRoot, relative);
}
