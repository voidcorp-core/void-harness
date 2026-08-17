// Cross-project telemetry rollup (issue #72). Per-project telemetry is too thin
// to clear the cost/behavior gates alone (a skill fires a handful of times in one
// repo). The canonical hook runner self-registers each project into a global index
// (~/.void/projects/<hash>.path holding the project root); this module discovers
// those roots, merges their .void/*.jsonl streams, and turns the resulting
// findings into privacy-scoped GitHub issue drafts. HITL: drafting only — the
// actual push is gated by an explicit flag in the command layer.

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { legacyVoidPath, voidMachinePath } from '@voidcorp/hook-runner';
import { loadCanonicalEventBody } from './graph-io.js';

/** The global rollup index dir. `VOID_GLOBAL_DIR` overrides the base (test seam). */
export function globalIndexDir(): string {
  const base = process.env.VOID_GLOBAL_DIR ?? join(homedir(), '.void');
  return join(base, 'projects');
}

/**
 * Registered project roots, deduped and validated (a root whose directory no
 * longer exists is dropped — projects get moved or deleted). Sorted for a stable
 * merge order.
 */
export function discoverProjects(indexDir: string = globalIndexDir()): string[] {
  if (!existsSync(indexDir)) return [];
  const roots = new Set<string>();
  let names: string[];
  try {
    names = readdirSync(indexDir);
  } catch {
    return [];
  }
  for (const f of names) {
    if (!f.endsWith('.path')) continue;
    try {
      const pointer = join(indexDir, f);
      const pointerInfo = lstatSync(pointer);
      if (
        !pointerInfo.isFile()
        || pointerInfo.isSymbolicLink()
        || pointerInfo.size > 4_096
      ) {
        continue;
      }
      const root = readFileSync(pointer, 'utf8').trim();
      if (
        root !== ''
        && isAbsolute(root)
        && existsSync(root)
        && statSync(root).isDirectory()
      ) {
        roots.add(root);
      }
    } catch {
      // unreadable pointer — skip, never crash the rollup
    }
  }
  return [...roots].sort();
}

/**
 * Concatenate the telemetry bodies across projects. Each session id is globally
 * unique, so concatenating activation/outcome streams is a valid merge; the
 * downstream tolerant parsers skip any blank separators.
 *
 * Reads BOTH halves of the layout split per project: a rollup spans machines and
 * repositories, so at any moment some projects have migrated and some have not,
 * and reading one half would silently shrink the very sample this exists to grow.
 */
export function mergeTelemetry(roots: readonly string[], file: string): string {
  const parts: string[] = [];
  for (const root of roots) {
    const candidates = [voidMachinePath(root, file), legacyVoidPath(root, file)]
      .filter((path, index, all) => all.indexOf(path) === index);
    for (const p of candidates) {
      if (!existsSync(p)) continue;
      try {
        parts.push(readFileSync(p, 'utf8'));
      } catch {
        // skip an unreadable project file
      }
    }
  }
  return parts.join('\n');
}

/** Merge canonical run journals across projects for graph/cost/behavior readers. */
export function mergeCanonicalTelemetry(roots: readonly string[]): string {
  return roots
    .map((root) => loadCanonicalEventBody(root))
    .filter((body) => body !== '')
    .join('\n');
}

/** A normalized finding ready to become an issue. Privacy: component + counts
 * only — NEVER a project path, file content, or session id. */
export interface RollupFinding {
  /** dead | stale | expensive | should-have-fired | ... */
  readonly type: string;
  /** graph node id or component name, e.g. `skill:tdd` — safe to publish. */
  readonly component: string;
  /** counts / windows only, no raw data. */
  readonly detail: string;
}

export interface IssueDraft {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

/** Stable identity of a finding: one issue per (type, component). */
export function dedupeKey(f: RollupFinding): string {
  return `${f.type}:${f.component}`;
}

/** Render a finding as a privacy-scoped issue draft. The title is deterministic
 * so re-runs update the same issue instead of duplicating it. */
export function findingToIssue(f: RollupFinding): IssueDraft {
  const title = `[harness-audit] ${f.type}: ${f.component}`;
  const body = [
    'Auto-detected by the cross-project rollup audit (`void-harness audit --push`).',
    '',
    `- type: ${f.type}`,
    `- component: ${f.component}`,
    `- signal: ${f.detail}`,
    '',
    'Privacy: component names and aggregate counts only — no project paths or content.',
    'HITL: a deprecation / tuning candidate, never an automatic action.',
  ].join('\n');
  return { title, body, labels: ['harness-feedback'] };
}

/** Split drafts into create vs update given the set of existing issue titles. */
export function reconcileIssues(
  drafts: readonly IssueDraft[],
  existingTitles: ReadonlySet<string>,
): { create: IssueDraft[]; update: IssueDraft[] } {
  const create: IssueDraft[] = [];
  const update: IssueDraft[] = [];
  for (const d of drafts) (existingTitles.has(d.title) ? update : create).push(d);
  return { create, update };
}
