// tdd-cover: e2e packages/cli/src/commands/autopilot-worktrees.test.ts
// Pure location validation; callers observe physical paths. Git 2.50 git-worktree(1)
// and https://specifications.freedesktop.org/basedir/latest/ define the boundaries.
import { posix, win32 } from 'node:path';
import { type WorktreeObservation, worktreeFailure } from './worktree-contract.js';

export function pathSemantics(path: string) {
  return /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix;
}

export function pathKey(path: string, caseSensitive = true): string {
  const normalized = pathSemantics(path).normalize(path);
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US');
}

export function absolutePath(path: string): string {
  const paths = pathSemantics(path);
  const hasControl = [...path].some((character) => character.charCodeAt(0) < 32);
  if (!paths.isAbsolute(path) || path.split(/[\\/]/).includes('..') || hasControl) {
    worktreeFailure(`worktree path must be absolute without traversal: ${path}`);
  }
  return paths.normalize(path);
}

function within(root: string, path: string, caseSensitive: boolean): boolean {
  const paths = pathSemantics(root);
  const relative = paths.relative(pathKey(root, caseSensitive), pathKey(path, caseSensitive));
  return relative === '' || (!relative.startsWith(`..${paths.sep}`) && relative !== '..' && !paths.isAbsolute(relative));
}

function durable(path: string, observation: WorktreeObservation): string {
  const normalized = absolutePath(path);
  const forbidden = [observation.repository.root, ...observation.temporaryRoots];
  if (pathSemantics(path) === posix) forbidden.push('/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/var/folders', '/private/var/folders');
  if (forbidden.some((root) => within(absolutePath(root), normalized, observation.caseSensitive))) {
    worktreeFailure(`worktree location is inside the repository or temporary storage: ${path}`);
  }
  return normalized;
}

export function resolveWorktreeRoot(observation: WorktreeObservation): string {
  const env = observation.environment;
  absolutePath(env.home);
  const paths = pathSemantics(env.home);
  if (env.voidWorktrees) return durable(env.voidWorktrees, observation);
  if (env.xdgDataHome) durable(env.xdgDataHome, observation);
  const root = env.voidWorktrees || paths.join(env.xdgDataHome || paths.join(env.home, '.local', 'share'), 'git-worktrees');
  return durable(root, observation);
}

export function assertBranch(branch: string): void {
  // git-check-ref-format(1): preserve observed Unicode refs. Identifiers for new
  // tickets are slugs; an existing Git branch is not a ticket identifier.
  const hasControlOrSpace = [...branch].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127;
  });
  if (branch === '@' || branch.startsWith('-') || branch.includes('..') || branch.includes('@{')
    || hasControlOrSpace || /[~^:?*[\\]/.test(branch) || branch.endsWith('.')
    || branch.split('/').some((part) => part === '' || part.startsWith('.') || part.endsWith('.lock'))) {
    worktreeFailure(`invalid or ambiguous branch name: ${branch}`);
  }
}

export function worktreeDestination(observation: WorktreeObservation, branch: string) {
  assertBranch(branch);
  const root = resolveWorktreeRoot(observation);
  const path = pathSemantics(root).join(root, observation.repository.name, ...branch.split('/'));
  const matches = observation.destinations.filter((entry) => pathKey(entry.path, observation.caseSensitive) === pathKey(path, observation.caseSensitive));
  if (matches.length !== 1) worktreeFailure(`observe exactly one physical destination for ${path}`);
  const destination = matches[0];
  if (!destination) worktreeFailure(`missing destination: ${path}`);
  if (absolutePath(destination.path) !== absolutePath(path)) worktreeFailure(`destination spelling collision: ${path}`);
  durable(destination.path, observation);
  durable(destination.canonicalPath, observation);
  return { ...destination, canonicalPath: absolutePath(destination.canonicalPath) };
}

export function validateInventory(observation: WorktreeObservation): void {
  absolutePath(observation.repository.root);
  resolveWorktreeRoot(observation);
  const paths = new Set<string>();
  const branches = new Set<string>();
  for (const entry of observation.worktrees) {
    const path = pathKey(absolutePath(entry.path), observation.caseSensitive);
    if (paths.has(path)) worktreeFailure(`duplicate worktree path: ${entry.path}`);
    paths.add(path);
    if (entry.exists && !entry.headSha) worktreeFailure(`missing HEAD observation for ${entry.path}`);
    if (entry.branch !== undefined) {
      if (!entry.branch.startsWith('refs/heads/')) worktreeFailure(`expected full local branch ref: ${entry.branch}`);
      assertBranch(entry.branch.slice('refs/heads/'.length));
      const branch = entry.branch;
      if (branches.has(branch)) worktreeFailure(`competing registered worktrees for ${entry.branch}`);
      branches.add(branch);
    }
  }
  const refs = new Set<string>();
  for (const entry of observation.branches) {
    if (!entry.branch.startsWith('refs/heads/')) worktreeFailure(`expected full local branch ref: ${entry.branch}`);
    assertBranch(entry.branch.slice('refs/heads/'.length));
    const key = entry.branch;
    if (refs.has(key)) worktreeFailure(`duplicate branch observation: ${entry.branch}`);
    refs.add(key);
  }
  for (const entry of observation.worktrees.filter((item) => item.branch !== undefined && item.exists)) {
    const ref = observation.branches.find((item) => item.branch === entry.branch);
    if (!ref || ref.headSha !== entry.headSha) worktreeFailure(`branch/HEAD inventory disagrees at ${entry.path}`);
  }
}
