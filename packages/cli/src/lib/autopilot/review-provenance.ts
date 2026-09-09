// Which review passes actually ran on a unit, and in what context.
//
// Measured on 2026-09-02: a worker executed the highest-risk ticket of a project
// with no specialist review at all. The engine had classified it `requiredMode:
// team` and dispatched six specialists, but the worker's runtime exposed no
// fresh-context subagent primitive. The worker behaved impeccably -- it refused
// to record events for envelopes that never ran, closed the mission as
// abandoned, ran every pass as a self-review and said so.
//
// It said so in `decisions`, which `reconcile`, `gate` and `publish` never read.
// So a self-reviewed unit and a panel-briefed one produced the same integration
// branch, the same pull request body and the same green run. `gate` exists to
// answer "did the panel speak first" and refuses when it did not; that guard
// could not fire, because the worker's incapacity never reached it as a fact.
//
// This is the fact. A grade that can only be claimed by naming the passes and
// the context each one ran in, refused at the parsing boundary like every other
// worker claim -- prose has no compiler, and a signed-looking artefact whose
// signature nobody checked is worse than a run that fails.
//
// Pure. Moving the panel to the orchestrator is a separate change; this only
// makes the degradation a value while it still exists.

import { autopilotFailure } from './errors.js';

/** Where one review pass ran. A fresh context is the whole point of a panel. */
export type ReviewContext = 'fresh-context-subagent' | 'self-review';

export interface ReviewPass {
  readonly name: string;
  readonly context: ReviewContext;
}

/**
 * What reviewed this unit, as a value rather than as a sentence.
 *
 * Three cases, and the difference between the last two is load-bearing. A unit
 * reviewed by its own author in its own context was reviewed, weakly; a unit
 * nothing reviewed was not reviewed at all, and the two must not merge on the
 * same evidence.
 */
export type ReviewProvenance =
  | { readonly kind: 'panel'; readonly passes: readonly ReviewPass[] }
  | {
      readonly kind: 'self-review';
      readonly passes: readonly ReviewPass[];
      /** Why no panel could be convened. */
      readonly because: string;
    }
  | { readonly kind: 'none'; readonly because: string };

export interface UnitReview {
  readonly ticketId: string;
  readonly provenance: ReviewProvenance;
}

export type ReviewGrade = 'panel-grade' | 'self-reviewed' | 'unreviewed';

export interface UnitReviewVerdict {
  readonly ticketId: string;
  readonly grade: ReviewGrade;
  readonly detail: string;
}

export interface ReviewOutcome {
  readonly kind: 'panel-grade' | 'downgraded' | 'refuse';
  readonly units: readonly UnitReviewVerdict[];
  readonly detail: string;
}

const MAX_PASSES = 50;
const MAX_TEXT = 2000;

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

/** A JSON null and a missing key are the same absence, so both arrive here. */
function isRecord(value: unknown): value is Record<string, unknown> {
  const defined = value ?? undefined;
  return typeof defined === 'object' && defined !== undefined && !Array.isArray(defined);
}

function isReviewContext(value: unknown): value is ReviewContext {
  return value === 'fresh-context-subagent' || value === 'self-review';
}

function isProvenanceKind(value: unknown): value is ReviewProvenance['kind'] {
  return value === 'panel' || value === 'self-review' || value === 'none';
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_TEXT) {
    invalid(
      `the review provenance field \`${field}\` is unusable`,
      `\`${field}\` must be a non-empty string of at most ${MAX_TEXT} characters`,
      `state \`${field}\` in one bounded sentence`,
    );
  }
  return value;
}

function parsePasses(value: unknown): readonly ReviewPass[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PASSES) {
    invalid(
      'the review provenance names no pass, or more than a unit can run',
      `\`passes\` must hold between 1 and ${String(MAX_PASSES)} entries`,
      'name each review pass that ran, with the context it ran in',
    );
  }
  return value.map((entry: unknown) => {
    const pass: Record<string, unknown> = isRecord(entry) ? entry : {};
    if (!isReviewContext(pass.context)) {
      invalid(
        'a review pass does not say where it ran',
        `\`context\` is ${JSON.stringify(pass.context)}; it is fresh-context-subagent or self-review`,
        'report `fresh-context-subagent` only for a pass a separate context actually ran',
      );
    }
    return { name: requireText(pass.name, 'passes[].name'), context: pass.context };
  });
}

/**
 * Read a worker's review provenance, or refuse it.
 *
 * The one invariant worth the type: a `panel` grade whose own list holds a
 * self-review pass is refused. That contradiction is exactly what prose let a
 * worker state and what nobody downstream could act on.
 */
export function parseReviewProvenance(raw: unknown): ReviewProvenance {
  if (!isRecord(raw)) {
    invalid(
      'the worker reported no usable review provenance',
      `\`review\` is ${raw === undefined ? 'absent' : typeof raw}, and absence of a record is absence of the act`,
      'report which review passes ran and in which context, or `{ kind: "none", because: ... }`',
    );
  }
  if (!isProvenanceKind(raw.kind)) {
    invalid(
      'the worker reported a review provenance this contract cannot read',
      `\`kind\` is ${JSON.stringify(raw.kind)}; known kinds are panel, self-review, none`,
      'report `panel`, `self-review` or `none`; there is no partial grade',
    );
  }
  const kind = raw.kind;

  if (kind === 'none') return { kind, because: requireText(raw.because, 'because') };

  const passes = parsePasses(raw.passes);
  if (kind === 'self-review') {
    return { kind, passes, because: requireText(raw.because, 'because') };
  }

  const own = passes.filter((pass) => pass.context === 'self-review');
  if (own.length > 0) {
    invalid(
      'the worker claimed a panel for passes it ran itself',
      `${own.map((pass) => pass.name).join(', ')} ran as self-review inside a \`panel\` provenance`,
      'report `self-review` with the reason no panel could be convened; a panel is what a fresh context ran',
    );
  }
  return { kind, passes };
}

const GRADE_OF: Readonly<Record<ReviewProvenance['kind'], ReviewGrade>> = Object.freeze({
  panel: 'panel-grade',
  'self-review': 'self-reviewed',
  none: 'unreviewed',
});

function verdictFor(unit: UnitReview): UnitReviewVerdict {
  const provenance = unit.provenance;
  const detail = provenance.kind === 'panel'
    ? `${String(provenance.passes.length)} pass(es) in a fresh context`
    : provenance.because;
  return { ticketId: unit.ticketId, grade: GRADE_OF[provenance.kind], detail };
}

/**
 * What the cluster's review provenance permits.
 *
 * A unit nothing reviewed refuses: that is the guard `gate` already applies to
 * every other record. A self-reviewed unit does NOT refuse -- the worker did the
 * work and reported honestly, and killing a finished run would only teach
 * workers to say less -- but the run stops being panel-grade and says which unit
 * cost it that, all the way into the pull request body a person promotes on.
 * Silence is what this replaces, not judgement.
 */
export function judgeReviewProvenance(units: readonly UnitReview[]): ReviewOutcome {
  if (units.length === 0) {
    return {
      kind: 'refuse',
      units: [],
      detail: 'no unit was named for review provenance, and judging nothing is not judging it clean',
    };
  }

  const verdicts = units.map(verdictFor);
  const unreviewed = verdicts.filter((verdict) => verdict.grade === 'unreviewed');
  if (unreviewed.length > 0) {
    return {
      kind: 'refuse',
      units: verdicts,
      detail: `no review pass ran on ${unreviewed.map((verdict) => verdict.ticketId).join(', ')}`,
    };
  }

  const downgraded = verdicts.filter((verdict) => verdict.grade === 'self-reviewed');
  if (downgraded.length > 0) {
    return {
      kind: 'downgraded',
      units: verdicts,
      detail: `${downgraded.map((verdict) => verdict.ticketId).join(', ')} was reviewed by its own author, in its own context`,
    };
  }

  return { kind: 'panel-grade', units: verdicts, detail: 'every unit was briefed by a fresh context' };
}
