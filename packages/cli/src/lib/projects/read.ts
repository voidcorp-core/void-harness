// The I/O edge: gather one project's observations, then hand them to the pure
// summariser.
//
// Two properties this module must never break.
//
// It NEVER WRITES. The view is a projection; a read that repairs or regenerates
// is how a dashboard quietly becomes a second source of truth.
//
// It NEVER THROWS for one project. Eight projects are read at once, and a
// permission error on one of them must cost that one project's detail, not the
// whole answer.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { observeDecisions, type DecisionEntry } from './decisions-source.js';
import type { DiscoveredProject } from './discover.js';
import {
  summarizeProject,
  type ActiveProgramSignal,
  type CheckpointSignal,
  type GitSignals,
  type ProjectSummary,
} from './summary.js';

const NO_GIT: GitSignals = Object.freeze({
  available: false,
  branch: undefined,
  dirtyFiles: 0,
  unpushedCommits: 0,
  lastCommitAt: undefined,
  commitsToday: 0,
});

/** Bounded so a pathological repository cannot stall the whole view. */
const GIT_TIMEOUT_MS = 2_000;
const MAX_READ_BYTES = 4_000_000;

function git(cwd: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', args as string[], {
      cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function readText(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_READ_BYTES) return undefined;
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function countLines(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  return value.split(/\r?\n/).filter((line) => line.trim() !== '').length;
}

export function readGitSignals(path: string): GitSignals {
  const branch = git(path, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === undefined) return NO_GIT;

  const lastCommitRaw = git(path, ['log', '-1', '--format=%ct']);
  const lastCommitAt =
    lastCommitRaw === undefined || !/^\d+$/.test(lastCommitRaw)
      ? undefined
      : Number(lastCommitRaw) * 1_000;

  // `@{u}` fails when the branch has no upstream. That resolves to zero rather
  // than to a guess: without a remote to compare against, "how many commits are
  // only here" has no answer, and inventing one would put a number in the view
  // that nothing backs.
  const unpushedRaw = git(path, ['rev-list', '--count', '@{u}..HEAD']);
  const unpushedCommits =
    unpushedRaw !== undefined && /^\d+$/.test(unpushedRaw) ? Number(unpushedRaw) : 0;

  return {
    available: true,
    branch: branch === 'HEAD' ? undefined : branch,
    dirtyFiles: countLines(git(path, ['status', '--porcelain'])),
    unpushedCommits,
    lastCommitAt,
    commitsToday: countLines(git(path, ['log', '--since=midnight', '--format=%H'])),
  };
}

function readDecisions(root: string): ReturnType<typeof observeDecisions> {
  const dir = join(root, 'docs', 'decisions-log');
  let perFile: DecisionEntry[] = [];
  try {
    if (existsSync(dir)) {
      perFile = readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .map((name) => {
          const date = /^(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
          const title = name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
          return date === undefined ? { title } : { title, date };
        });
    }
  } catch {
    perFile = [];
  }
  return observeDecisions({ monolith: readText(join(root, 'docs', 'DECISIONS.md')), perFile });
}

function readPlanCount(root: string): number {
  try {
    return readdirSync(join(root, 'plans')).filter((name) => name.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

/**
 * The declared program, when the project runs one. Read for display only: the
 * tracker owns execution state, and reaching it would put the network on the
 * path of a view that must stay offline.
 */
function readActiveProgramSignal(root: string): ActiveProgramSignal | undefined {
  const raw = readText(join(root, 'plans', 'ACTIVE.md'));
  if (raw === undefined) return undefined;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1];
  if (frontmatter === undefined) return undefined;
  try {
    const parsed = parseYaml(frontmatter) as {
      status?: unknown;
      program?: unknown;
      tracker?: { issues?: unknown };
    };
    if (parsed.status !== 'executing' || typeof parsed.program !== 'string') return undefined;
    const issues = parsed.tracker?.issues;
    return {
      program: parsed.program,
      issueCount: Array.isArray(issues) ? issues.length : 0,
    };
  } catch {
    return undefined;
  }
}

/**
 * The session checkpoint. Absent everywhere until it ships, which is why the
 * whole view is designed to be useful without it.
 */
function readCheckpoint(root: string): CheckpointSignal | undefined {
  const path = join(root, '.void', 'session', 'current.md');
  const raw = readText(path);
  if (raw === undefined) return undefined;
  // Strip the frontmatter BLOCK, not lines that merely look like it: filtering
  // line by line let `date: 2026-08-17` through as the resume line.
  const body = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n([\s\S]*))?$/.exec(raw)?.[1] ?? raw;
  const resumeLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'));
  if (resumeLine === undefined) return undefined;
  try {
    return { resumeLine, writtenAt: statSync(path).mtimeMs };
  } catch {
    return undefined;
  }
}

/** Read one project and summarise it. Never writes, never throws. */
export function readProjectSummary(ref: DiscoveredProject, now: number): ProjectSummary {
  return summarizeProject({
    ref,
    now,
    git: readGitSignals(ref.path),
    decisions: readDecisions(ref.path),
    planCount: readPlanCount(ref.path),
    ...(() => {
      const active = readActiveProgramSignal(ref.path);
      return active === undefined ? {} : { activeProgram: active };
    })(),
    ...(() => {
      const checkpoint = readCheckpoint(ref.path);
      return checkpoint === undefined ? {} : { checkpoint };
    })(),
  });
}
