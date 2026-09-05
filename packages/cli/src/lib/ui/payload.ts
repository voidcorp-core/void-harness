// The one composition of the projects payload.
//
// Both the CLI (`--json`) and the served route call THIS. That is not tidiness:
// it is what makes the parity between them structural instead of a promise. The
// moment either side composes its own version, the two start describing the same
// project differently and there is no way to tell which is right.

import { readDiscoveryConfig } from '../projects/config.js';
import {
  discoverConfiguredProjects,
  voidGlobalDir,
} from '../projects/catalog.js';
import { readProjectSummary } from '../projects/read.js';
import type { ProjectSummary } from '../projects/summary.js';
import type { UnreadablePath } from '../projects/discover.js';

export interface ProjectsPayload {
  /** When the projection was taken. A view left open is showing an old answer. */
  readonly readAt: string;
  readonly roots: readonly string[];
  readonly rootsSource: 'declared' | 'derived';
  readonly unreadable: readonly UnreadablePath[];
  readonly projects: readonly ProjectSummary[];
}

export { voidGlobalDir } from '../projects/catalog.js';

/**
 * Projects needing attention first, then the ones touched most recently.
 * No score: a percentage invites optimising the number, while a named reason
 * can be acted on.
 */
function byAttentionThenActivity(a: ProjectSummary, b: ProjectSummary): number {
  if (a.attention.length !== b.attention.length) return b.attention.length - a.attention.length;
  const aIdle = a.idleDays ?? Number.MAX_SAFE_INTEGER;
  const bIdle = b.idleDays ?? Number.MAX_SAFE_INTEGER;
  if (aIdle !== bIdle) return aIdle - bIdle;
  return a.name < b.name ? -1 : 1;
}

export interface PayloadOptions {
  readonly globalDir?: string;
  readonly cwd?: string;
  readonly now?: number;
}

/** Read the park. Never writes, never regenerates, never caches. */
export function readProjectsPayload(options: PayloadOptions = {}): ProjectsPayload {
  const now = options.now ?? Date.now();
  const discovered = discoverConfiguredProjects({
    globalDir: options.globalDir ?? voidGlobalDir(),
    cwd: options.cwd ?? process.cwd(),
  });

  return {
    readAt: new Date(now).toISOString(),
    roots: discovered.roots,
    rootsSource: discovered.rootsSource,
    unreadable: discovered.unreadable,
    projects: discovered.projects
      .map((ref) => readProjectSummary(ref, now))
      .sort(byAttentionThenActivity),
  };
}

/** The config path, for the empty-state hint. */
export function discoveryConfigPath(options: PayloadOptions = {}): string {
  return readDiscoveryConfig({
    globalDir: options.globalDir ?? voidGlobalDir(),
    cwd: options.cwd ?? process.cwd(),
  }).path;
}
