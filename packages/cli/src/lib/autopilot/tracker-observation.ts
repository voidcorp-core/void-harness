// What the skill saw in the tracker, in the shape the CLI is willing to reason
// about. The CLI never queries a tracker: it decides from an observation and
// returns actions, and the skill applies them and observes again.
//
// The types are deliberately narrow. A tracker issue carries far more than this
// — descriptions, attachments, history — and none of it may influence whether a
// cluster gets claimed. Narrowing here is what keeps the decision auditable.

import { type LeaseMarker, parseLeaseMarker } from './linear-marker.js';

export interface ObservedRelation {
  readonly id: string;
  /** Native state name of the blocking issue, as the tracker reports it. */
  readonly state: string;
}

export interface ObservedIssue {
  readonly id: string;
  /** Native state name, compared against the active program's declared states. */
  readonly state: string;
  /** Identity of the current assignee, or null when unassigned. */
  readonly assigneeId: string | null;
  /** Raw comment bodies, newest last. Only lease markers are read from them. */
  readonly comments: readonly string[];
  readonly blockedBy: readonly ObservedRelation[];
}

export interface TrackerObservation {
  readonly schemaVersion: 1;
  /** ISO instant the observation was taken, used to age leases. */
  readonly observedAt: string;
  readonly issues: readonly ObservedIssue[];
}

/** Bounds that keep one pathological observation from becoming the whole run. */
const MAX_ISSUES = 200;
const MAX_COMMENTS_PER_ISSUE = 200;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isWellFormedObservation(value: unknown): value is TrackerObservation {
  if (typeof value !== 'object' || value === null) return false;
  const observation = value as Partial<TrackerObservation>;

  if (observation.schemaVersion !== 1) return false;
  if (!isNonEmptyString(observation.observedAt) || Number.isNaN(Date.parse(observation.observedAt))) return false;
  if (!Array.isArray(observation.issues) || observation.issues.length > MAX_ISSUES) return false;

  const seen = new Set<string>();
  for (const issue of observation.issues) {
    if (typeof issue !== 'object' || issue === null) return false;
    if (!isNonEmptyString(issue.id) || seen.has(issue.id)) return false;
    seen.add(issue.id);
    if (!isNonEmptyString(issue.state)) return false;
    if (issue.assigneeId !== null && !isNonEmptyString(issue.assigneeId)) return false;
    const comments: readonly unknown[] = issue.comments;
    if (!Array.isArray(comments) || comments.length > MAX_COMMENTS_PER_ISSUE) return false;
    if (comments.some((comment) => typeof comment !== 'string')) return false;

    const blockedBy: readonly unknown[] = issue.blockedBy;
    if (!Array.isArray(blockedBy)) return false;
    if (
      blockedBy.some((relation) => {
        const edge = relation as Partial<ObservedRelation> | null;
        return !isNonEmptyString(edge?.id) || !isNonEmptyString(edge?.state);
      })
    ) {
      return false;
    }
  }
  return true;
}

/** The lease marker an issue carries, or undefined when it carries none. */
export function leaseOf(issue: ObservedIssue): LeaseMarker | undefined {
  for (const comment of issue.comments) {
    const marker = parseLeaseMarker(comment);
    if (marker !== undefined) return marker;
  }
  return undefined;
}

/** True when every blocker of the issue sits in one of the program's done states. */
export function isUnblocked(issue: ObservedIssue, doneStates: readonly string[]): boolean {
  return issue.blockedBy.every((relation) => doneStates.includes(relation.state));
}
