// How many remote CI runs pushing the integration branch will actually cost,
// and whether a single run can honestly be promised.
//
// Grounded in the documented behaviour of GitHub Actions: a single commit does
// not fire `push` and `pull_request` at once, but pushing a branch and then
// opening a pull request for it produces one run each. A workflow listening to
// both therefore costs two runs for the same tree, and the honest thing is to
// say so.
//
// What this never does is propose turning a check off. A required check exists
// because someone decided it should; the answer to "this will run twice" is to
// report it, not to silence one side.
//
// Undecidable syntax classifies as `unknown` rather than as a guess. A path
// filter is undecidable here on purpose: the diff is not known at this layer,
// and pretending otherwise would produce a confident wrong number.

import picomatch from 'picomatch';
import { parse as parseYaml } from 'yaml';

export type TriggerClass =
  | 'pull-request-only'
  | 'push-only'
  | 'redundant'
  | 'manual'
  | 'none'
  | 'unknown';

export interface WorkflowSource {
  readonly name: string;
  readonly text: string;
}

export interface TriggerVerdict {
  readonly workflow: string;
  readonly classification: TriggerClass;
  /** Remote runs this workflow will start, or null when undecidable. */
  readonly expectedRuns: number | null;
  readonly detail: string;
}

export interface CiTriggerPlan {
  readonly schemaVersion: 1;
  readonly workflows: readonly TriggerVerdict[];
  /** Total runs, or null when any workflow is undecidable. */
  readonly expectedRuns: number | null;
  /** True only when every workflow provably fires at most once. */
  readonly singleRunGuaranteed: boolean;
  readonly unknowns: readonly string[];
}

export interface TriggerContext {
  /** The integration branch being pushed. */
  readonly branch: string;
  /** The base the pull request targets. */
  readonly baseBranch: string;
}

const EXPRESSION = /\$\{\{/;

function asList(value: unknown): readonly string[] | undefined {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value as string[];
  return undefined;
}

/** GitHub branch filters are globs where `**` crosses separators. */
function matchesAny(patterns: readonly string[], ref: string): boolean {
  return patterns.some((pattern) => picomatch.isMatch(ref, pattern, { dot: true }));
}

type FilterOutcome = { readonly kind: 'fires' } | { readonly kind: 'skipped' } | { readonly kind: 'undecidable'; readonly why: string };

/** Does this event, with its filters, fire for `ref`? */
function evaluateFilters(config: unknown, ref: string): FilterOutcome {
  // `push:` with no map at all means every branch.
  if (config === null || config === undefined) return { kind: 'fires' };
  if (typeof config !== 'object' || Array.isArray(config)) {
    return { kind: 'undecidable', why: 'the event configuration is not a mapping' };
  }
  const filters = config as Record<string, unknown>;

  if (filters.paths !== undefined || filters['paths-ignore'] !== undefined) {
    // The diff is not known at this layer. A confident answer here would be a
    // wrong one, and this budget exists to be trustworthy.
    return { kind: 'undecidable', why: 'a paths filter cannot be evaluated without the diff' };
  }

  const included = filters.branches;
  const excluded = filters['branches-ignore'];

  for (const raw of [included, excluded]) {
    if (raw === undefined) continue;
    const patterns = asList(raw);
    if (patterns === undefined) return { kind: 'undecidable', why: 'a branch filter is not a string or a list' };
    if (patterns.some((pattern) => EXPRESSION.test(pattern))) {
      return { kind: 'undecidable', why: 'a branch filter carries an expression this parser does not evaluate' };
    }
  }

  const excludePatterns = asList(excluded);
  if (excludePatterns !== undefined && matchesAny(excludePatterns, ref)) return { kind: 'skipped' };

  const includePatterns = asList(included);
  if (includePatterns !== undefined && !matchesAny(includePatterns, ref)) return { kind: 'skipped' };

  return { kind: 'fires' };
}

function classify(source: WorkflowSource, context: TriggerContext): TriggerVerdict {
  const unknown = (detail: string): TriggerVerdict => ({
    workflow: source.name,
    classification: 'unknown',
    expectedRuns: null,
    detail,
  });

  let document: unknown;
  try {
    document = parseYaml(source.text);
  } catch (error) {
    return unknown(`the workflow is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof document !== 'object' || document === null) return unknown('the workflow does not parse to a mapping');

  // `on` is parsed as the boolean true by YAML 1.1 readers; the `yaml` package
  // follows 1.2 and keeps the string, but accept both rather than depend on it.
  const record = document as Record<string, unknown>;
  const on = record.on ?? record.true ?? (record as { True?: unknown }).True;
  if (on === undefined) return unknown('the workflow declares no `on:` key');

  const listed = asList(on);
  const events =
    listed !== undefined
      ? Object.fromEntries(listed.map((event) => [event, null]))
      : typeof on === 'object' && on !== null && !Array.isArray(on)
        ? (on as Record<string, unknown>)
        : undefined;
  if (events === undefined) return unknown('the `on:` key is neither a string, a list, nor a mapping');

  const reasons: string[] = [];

  /** Whether one event fires, recording why either way. */
  const fires = (event: 'push' | 'pull_request', ref: string): boolean | 'undecidable' => {
    if (!(event in events)) return false;
    const outcome = evaluateFilters(events[event], ref);
    if (outcome.kind === 'undecidable') {
      reasons.push(`${event}: ${outcome.why}`);
      return 'undecidable';
    }
    reasons.push(`${event} ${outcome.kind === 'fires' ? 'fires on' : 'does not match'} ${ref}`);
    return outcome.kind === 'fires';
  };

  const pushFires = fires('push', context.branch);
  // A pull_request branch filter targets the BASE, not the head.
  const pullFires = fires('pull_request', context.baseBranch);
  if (pushFires === 'undecidable' || pullFires === 'undecidable') {
    return unknown(reasons[reasons.length - 1] ?? 'an event filter is undecidable');
  }

  const runs = (pushFires ? 1 : 0) + (pullFires ? 1 : 0);
  const manualOnly = runs === 0 && ('workflow_dispatch' in events || 'workflow_call' in events);

  let classification: TriggerClass;
  if (pushFires && pullFires) classification = 'redundant';
  else if (pushFires) classification = 'push-only';
  else if (pullFires) classification = 'pull-request-only';
  else classification = manualOnly ? 'manual' : 'none';

  return {
    workflow: source.name,
    classification,
    expectedRuns: runs,
    detail: reasons.length > 0 ? reasons.join('; ') : 'no automatic event matches this run',
  };
}

export function planCiTriggers(
  workflows: readonly WorkflowSource[],
  context: TriggerContext,
): CiTriggerPlan {
  const verdicts = workflows.map((workflow) => classify(workflow, context));
  const unknowns = verdicts.filter((v) => v.classification === 'unknown').map((v) => v.workflow);

  return {
    schemaVersion: 1,
    workflows: verdicts,
    expectedRuns:
      unknowns.length > 0 ? null : verdicts.reduce((total, v) => total + (v.expectedRuns ?? 0), 0),
    // One unknown is enough to remove the guarantee: "probably once" is not a
    // guarantee, and this flag is read to decide whether to tell the human.
    singleRunGuaranteed:
      unknowns.length === 0 && verdicts.every((v) => (v.expectedRuns ?? 0) <= 1),
    unknowns,
  };
}
