import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CommitInfo } from './types.js';

// The sandbox helpers are deterministic git/fs operations — NOT LLM-bound — so
// they ARE unit-tested (sandbox.test.ts) against real throwaway dirs. Only the
// `claude -p` invocation in claude-adapter.ts is exempt from unit testing.

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'eval',
      GIT_AUTHOR_EMAIL: 'eval@void',
      GIT_COMMITTER_NAME: 'eval',
      GIT_COMMITTER_EMAIL: 'eval@void',
    },
  });
}

/** Materialize a fixture into a throwaway git repo; return the dir and its base commit. */
export function setupSandbox(fixture: Readonly<Record<string, string>>): { dir: string; baseSha: string } {
  const dir = mkdtempSync(join(tmpdir(), 'void-eval-'));
  for (const [rel, content] of Object.entries(fixture)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  // The subject is DELIBERATELY non-conventional ("fixture" is not an allowed
  // commit type): if commitIfMoved ever mis-attributes this to the agent, it
  // still scores ~0 (fails conventionalSubject + explainsWhy), never a false pass.
  git(dir, 'commit', '-q', '-m', 'fixture: initial state');
  return { dir, baseSha: git(dir, 'rev-parse', 'HEAD').trim() };
}

/**
 * Collect the sandbox's regular text files: repo-relative path -> content. Only
 * `entry.isFile()` is read (a symlink-to-directory reports isDirectory()===false
 * but is NOT a regular file, so reading it would throw EISDIR — that used to be
 * swallowed and silently drop the agent's written file). The narrow catch is for
 * a genuinely unreadable regular file only, which is not expected in a fresh
 * sandbox; utf8 reads do not throw on binary content (they mangle it, harmless
 * to the text scorers).
 */
export function collectFiles(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const r = rel ? join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(r);
      } else if (entry.isFile()) {
        out[r] = readFileSync(join(dir, r), 'utf8');
      }
      // symlinks / sockets / fifos are skipped by omission (never a written source file)
    }
  };
  walk('');
  return out;
}

/** The run's own commit, or undefined if HEAD did not move past the fixture commit. */
export function commitIfMoved(dir: string, baseSha: string): CommitInfo | undefined {
  if (git(dir, 'rev-parse', 'HEAD').trim() === baseSha) return undefined;
  return { subject: git(dir, 'log', '-1', '--format=%s').trim(), body: git(dir, 'log', '-1', '--format=%b').trim() };
}

/** Restore the sandbox to its base commit for a clean retry. */
export function resetSandbox(dir: string, baseSha: string): void {
  git(dir, 'reset', '-q', '--hard', baseSha);
  // -ffdx: also remove ignored files and nested repos, so a retry starts truly clean.
  git(dir, 'clean', '-qffdx');
}
