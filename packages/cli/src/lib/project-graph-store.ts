// The CLI's bounded, read-only view of the ProjectGraph.
//
// Two jobs, and they are deliberately separate:
//   1. `openProjectGraphStore` — the imperative shell: build (or reuse) the graph
//      for a root and report how much of it can be trusted.
//   2. `runProjectQuery` — a pure function from (store, request) to a report.
//      Everything the command prints comes from here, so the answers are testable
//      without a filesystem and identical whatever renders them.
//
// Three rules the surface exists to keep:
//
//   - **Targets are paths, answers are paths.** Callers work in repository-relative
//     files. Graph ids are an internal encoding — and an owner id is hashed when
//     the name is not id-safe, so an id is not even readable. Owners render by label.
//   - **A target may not leave the project root.** This surface reads a store on
//     behalf of an agent that may be repeating a path it was handed; `../../etc/...`
//     is refused with a correction rather than resolved.
//   - **A graph that is not fresh names its fallback.** Partial and degraded builds
//     answer, and say the answer may omit what extraction never saw. Withholding the
//     answer would be no safer and less useful; presenting it as complete is the lie.
//
// On staleness in this surface: `openProjectGraphStore` derives its observation from
// the build it just ran, so the root hash always matches and the fallback comes from
// the build state. The hash comparison earns its place for a caller that holds a
// snapshot across commands — it is not dead, it is not yet exercised here.

import { isAbsolute, relative, resolve } from 'node:path';
import type { GraphNodeV3, GraphSnapshotV3 } from '@voidcorp/harness-graph';
import {
  buildProjectGraph,
  DEFAULT_PROJECT_QUERY_BUDGET,
  explainNode,
  findPath,
  impactOf,
  normalizeProjectPath,
  ownersOf,
  projectFileId,
  stalenessOf,
  subgraphOf,
  testsFor,
  type ProjectBuildIssue,
  type ProjectGraphObservation,
  type ProjectQueryAnswer,
  type ProjectQueryBudget,
} from '@voidcorp/harness-graph/project';

const FILE_ID_PREFIX = 'project:file:';

export type ProjectQueryName =
  | 'explain'
  | 'path'
  | 'impact'
  | 'subgraph'
  | 'owners'
  | 'tests-for'
  | 'staleness';

export const PROJECT_QUERY_NAMES: readonly ProjectQueryName[] = Object.freeze([
  'explain',
  'path',
  'impact',
  'subgraph',
  'owners',
  'tests-for',
  'staleness',
]);

export interface ProjectGraphStore {
  /** Absolute project root every target is resolved against. */
  readonly root: string;
  readonly graph: GraphSnapshotV3;
  readonly state: 'fresh' | 'partial' | 'degraded';
  readonly observation: ProjectGraphObservation;
  readonly issues: readonly ProjectBuildIssue[];
}

export interface ProjectQueryRequest {
  readonly name: ProjectQueryName;
  /** Repository-relative (or in-root absolute) file paths, as the caller typed them. */
  readonly targets: readonly string[];
  readonly budget?: ProjectQueryBudget;
}

/** A problem the caller can act on: what went wrong, and what to do instead. */
export interface ProjectQueryProblem {
  readonly problem: string;
  readonly fix: string;
}

export interface ProjectQueryReport {
  readonly name: ProjectQueryName;
  /** The answer, one line each: file paths, owner labels, or explain fields. */
  readonly answers: readonly string[];
  readonly truncated: boolean;
  /** Set when the graph does not know, which is never the same as an empty answer. */
  readonly unknown?: string;
  /** Set when the caller must read source rather than trust this answer. */
  readonly fallback?: string;
  /** Set on a usage or safety error; `answers` is then empty. */
  readonly error?: ProjectQueryProblem;
}

export class ProjectGraphStoreError extends Error implements ProjectQueryProblem {
  readonly problem: string;
  readonly fix: string;

  constructor(problem: string, fix: string) {
    super(`${problem} -- ${fix}`);
    this.name = 'ProjectGraphStoreError';
    this.problem = problem;
    this.fix = fix;
  }
}

export interface ProjectGraphStoreOptions {
  /** Injected in tests; production builds the graph through the incremental extractor. */
  readonly build?: (root: string) => Promise<{
    readonly graph: GraphSnapshotV3;
    readonly state: 'fresh' | 'partial' | 'degraded';
    readonly issues: readonly ProjectBuildIssue[];
  }>;
}

/**
 * Open the project graph for `root`.
 *
 * `complete` is `state === 'fresh'`: a partial or degraded build omits paths the
 * extractor never saw, and a query over it can only ever be a lower bound.
 */
export async function openProjectGraphStore(
  root: string,
  options: ProjectGraphStoreOptions = {},
): Promise<ProjectGraphStore> {
  const build = options.build ?? ((at: string) => buildProjectGraph({ root: at }));
  const built = await build(root).catch((cause: unknown) => {
    throw new ProjectGraphStoreError(
      `could not build the project graph for ${root}`,
      `check the path is a readable project root, then rerun; underlying cause: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  });
  return Object.freeze({
    root: resolve(root),
    graph: built.graph,
    state: built.state,
    observation: Object.freeze({
      rootHash: built.graph.source.rootHash,
      complete: built.state === 'fresh',
    }),
    issues: built.issues,
  });
}

/** Repository-relative POSIX path for a target, or the reason it is refused. */
function resolveTarget(store: ProjectGraphStore, target: string): string | ProjectQueryProblem {
  const absolute = isAbsolute(target) ? target : resolve(store.root, target);
  const inside = relative(store.root, absolute);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    return {
      problem: `${target} is outside the project root ${store.root}`,
      fix: 'pass a path relative to the project root, such as packages/cli/src/main.ts',
    };
  }
  return normalizeProjectPath(inside);
}

/** How an id is shown to a human: files as their path, everything else by label. */
function render(graph: GraphSnapshotV3, id: string): string {
  if (id.startsWith(FILE_ID_PREFIX)) return id.slice(FILE_ID_PREFIX.length);
  const node = graph.nodes.find((candidate: GraphNodeV3) => candidate.id === id);
  return node?.label ?? id;
}

function answerReport(
  answer: ProjectQueryAnswer,
  graph: GraphSnapshotV3,
): { answers: readonly string[]; unknown?: string } {
  return answer.kind === 'known'
    ? { answers: answer.values.map((value) => render(graph, value)) }
    : { answers: [], unknown: answer.reason };
}

function explainLines(graph: GraphSnapshotV3, id: string): readonly string[] {
  const result = explainNode(graph, id);
  if (result === undefined) return [];
  const sources = result.provenance.sources
    .map((source) => `${source.kind}:${source.ref}`)
    .join(', ');
  return [
    `kind        ${result.node.kind}`,
    `label       ${result.node.label}`,
    `provenance  ${result.provenance.origin} (confidence ${result.provenance.confidence}) ${sources}`,
    `incoming    ${result.incoming.length} edge(s): ${[
      ...new Set(result.incoming.map((edge) => edge.kind)),
    ].join(', ')}`,
    `outgoing    ${result.outgoing.length} edge(s): ${[
      ...new Set(result.outgoing.map((edge) => edge.kind)),
    ].join(', ')}`,
  ];
}

const NAMED_GAPS = 3;

/**
 * What extraction left out, named.
 *
 * "partial" alone is unusable: a caller cannot tell seven skipped files out of
 * three thousand from a build that saw nothing, so it either distrusts a good
 * graph or trusts an empty one. The counts and a few paths make the gap the
 * caller's to judge.
 */
function gapSummary(issues: readonly ProjectBuildIssue[]): string {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  const codes = [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${count} ${code}`)
    .join(', ');
  const named = issues.slice(0, NAMED_GAPS).map((issue) => issue.path);
  const more = issues.length > NAMED_GAPS ? `, +${issues.length - NAMED_GAPS} more` : '';
  return `${issues.length} path(s) not extracted (${codes}): ${named.join(', ')}${more}`;
}

/** Why a caller must read source instead of trusting this store, if they must. */
function fallbackReason(store: ProjectGraphStore): string | undefined {
  const staleness = stalenessOf(store.graph, store.observation);
  const gaps = store.issues.length > 0 ? `; ${gapSummary(store.issues)}` : '';
  if (staleness.fallback === 'source') return `${staleness.reason}${gaps}`;
  if (store.state !== 'fresh') {
    return `the build is ${store.state}: read source for what it did not see${gaps}`;
  }
  return undefined;
}

function missing(path: string): string {
  return `${path} is not in this graph; it may be ignored, unextracted, or newly added`;
}

/**
 * Answer one query against an open store. Pure: same store and request, same report,
 * and the snapshot is never written to.
 */
export function runProjectQuery(
  store: ProjectGraphStore,
  request: ProjectQueryRequest,
): ProjectQueryReport {
  const budget = request.budget ?? DEFAULT_PROJECT_QUERY_BUDGET;
  const fallback = fallbackReason(store);
  const base = { name: request.name, answers: [] as readonly string[], truncated: false };
  const fail = (error: ProjectQueryProblem): ProjectQueryReport => ({ ...base, error });

  const resolved: string[] = [];
  for (const target of request.targets) {
    const outcome = resolveTarget(store, target);
    if (typeof outcome !== 'string') return fail(outcome);
    resolved.push(outcome);
  }

  if (request.name === 'staleness') {
    return {
      ...base,
      answers: [
        `state       ${store.state}`,
        `root hash   ${store.graph.source.rootHash}`,
        `verdict     ${fallback === undefined ? 'current: answers reflect the extracted tree' : fallback}`,
      ],
      ...(fallback === undefined ? {} : { fallback }),
    };
  }

  const needsTwo = request.name === 'path';
  if (needsTwo && resolved.length !== 2) {
    return fail({
      problem: 'path needs two files: where to start and where to end',
      fix: 'void-harness graph path <from> <to>',
    });
  }
  if (!needsTwo && resolved.length === 0) {
    return fail({
      problem: `${request.name} needs a file to answer about`,
      fix: `void-harness graph ${request.name} <file>`,
    });
  }

  const withFallback = (report: Omit<ProjectQueryReport, 'name'>): ProjectQueryReport => ({
    name: request.name,
    ...report,
    ...(fallback === undefined ? {} : { fallback }),
  });

  const ids = resolved.map((path) => projectFileId(path));
  const known = (index: number): boolean =>
    store.graph.nodes.some((node) => node.id === ids[index]);
  for (const [index, path] of resolved.entries()) {
    // Subgraph takes seeds and tolerates a miss; every other query about a file
    // the graph never saw must say so rather than answer an empty list.
    if (request.name !== 'subgraph' && !known(index)) {
      return withFallback({ answers: [], truncated: false, unknown: missing(path) });
    }
  }

  const first = ids[0] ?? '';
  switch (request.name) {
    case 'explain':
      return withFallback({ answers: explainLines(store.graph, first), truncated: false });
    case 'path': {
      const result = findPath(store.graph, first, ids[1] ?? '', budget);
      return withFallback(
        result.found
          ? {
              answers: result.path.map((id) => render(store.graph, id)),
              truncated: result.truncated,
            }
          : {
              answers: [],
              truncated: result.truncated,
              unknown: `no dependency path from ${resolved[0]} to ${resolved[1]}${
                result.truncated ? ' within the budget' : ''
              }`,
            },
      );
    }
    case 'impact': {
      const result = impactOf(store.graph, first, budget);
      return withFallback({
        answers: result.impacted.map((id) => render(store.graph, id)),
        truncated: result.truncated,
      });
    }
    case 'subgraph': {
      const result = subgraphOf(store.graph, ids, budget);
      return withFallback({
        answers: result.nodes.map((node) => render(store.graph, node.id)),
        truncated: result.truncated,
      });
    }
    case 'owners':
      return withFallback({
        ...answerReport(ownersOf(store.graph, first), store.graph),
        truncated: false,
      });
    case 'tests-for':
      return withFallback({
        ...answerReport(testsFor(store.graph, first), store.graph),
        truncated: false,
      });
  }
}
