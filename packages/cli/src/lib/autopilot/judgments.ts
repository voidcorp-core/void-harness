// The narrow, typed judgments an agent returns at each decision point of the loop.
//
// The model keeps its freedom over the work itself; at a decision point its answer
// is closed and admitted here before anything acts on it. An answer that does not
// fit is refused with the field at fault, never read charitably: no default fills a
// missing field, an unknown field is not ignored, and a blank text is not a reason.
// Policy (slots, collisions, review rounds, merges) stays in the code that consumes
// these values; this module only decides whether an answer is well-formed.
//
// Zod 4 strict objects refuse unknown keys: https://zod.dev/api#zstrictobject.

import { z } from 'zod';
import { normaliseArea } from './footprint-area.js';

/** A reason is one or two sentences a human reads in a recap or a Linear comment. */
export const REASON_MAX = 500;

/** The spec asks the curator for one or two sentences per moved ticket. */
export const JUSTIFICATION_MAX = 280;

/**
 * Four slots at most, and the curator re-ranks after every merge, so the queue is
 * only read until the next re-ranking. Its head can still be skipped for a
 * collision, so four candidates per slot keep every slot fed without letting a
 * curator hand the loop an unbounded backlog dump.
 */
export const CURATOR_QUEUE_MAX = 16;

/** A footprint names the ground a ticket touches, not an inventory of files. */
export const FOOTPRINT_AREAS_MAX = 64;
const AREA_MAX = 512;

/** A review that finds more than this has not been bounded to what is wrong. */
export const BLOCKING_MAX = 32;
export const ADVISORY_MAX = 64;

export type Admission<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function boundedText(maximum: number) {
  return z
    .string()
    .max(maximum)
    .refine((value) => value.trim().length > 0, { error: 'must not be blank' });
}

const reason = boundedText(REASON_MAX);

const ticketId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, { error: 'must be a tracker identifier' })
  .brand<'TicketId'>();
export type TicketId = z.infer<typeof ticketId>;

// `normaliseArea` is the one reading every footprint consumer shares, so the queue
// stores its spelling; an area it refuses claims nothing and is refused here too.
const area = z
  .string()
  .max(AREA_MAX)
  .transform((value, context) => {
    try {
      return normaliseArea(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'claims no file git reports' });
      return z.NEVER;
    }
  });

// `path:line`, line from 1, no whitespace: the form a reader can open directly.
const location = z
  .string()
  .max(AREA_MAX)
  .regex(/^[^\s:]+:[1-9][0-9]*$/, { error: 'must be file:line' });

const ticketReadinessSchema = z.strictObject({
  verdict: z.enum(['ready', 'needs-enrichment', 'ambiguous']),
  reason,
});
export type TicketReadiness = z.infer<typeof ticketReadinessSchema>;

const queueEntrySchema = z.strictObject({
  ticketId,
  justification: boundedText(JUSTIFICATION_MAX),
  footprint: z.array(area).min(1).max(FOOTPRINT_AREAS_MAX),
});

const curatorQueueSchema = z
  .strictObject({ entries: z.array(queueEntrySchema).max(CURATOR_QUEUE_MAX) })
  .superRefine((queue, context) => {
    const seen = new Set<string>();
    queue.entries.forEach((queued, index) => {
      if (seen.has(queued.ticketId)) {
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'ticketId'],
          message: `queues ${queued.ticketId} a second time`,
        });
      }
      seen.add(queued.ticketId);
    });
  });
export type CuratorQueue = z.infer<typeof curatorQueueSchema>;
export type CuratorQueueEntry = CuratorQueue['entries'][number];

const conflictClassSchema = z.strictObject({
  class: z.enum(['mechanical', 'semantic']),
  reason,
});
export type ConflictClass = z.infer<typeof conflictClassSchema>;

// A blocking finding without a concrete scenario is an opinion, and an opinion
// does not hold a ticket back: every field is required and must say something.
const blockingFindingSchema = z.strictObject({
  location,
  scenario: boundedText(REASON_MAX),
  correction: boundedText(REASON_MAX),
});

const advisoryFindingSchema = z.strictObject({
  location: location.optional(),
  note: boundedText(REASON_MAX),
});

const reviewVerdictSchema = z.strictObject({
  round: z.literal([1, 2]),
  blocking: z.array(blockingFindingSchema).max(BLOCKING_MAX),
  advisory: z.array(advisoryFindingSchema).max(ADVISORY_MAX),
});
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;
export type BlockingFinding = ReviewVerdict['blocking'][number];

function describeIssue(issue: z.core.$ZodIssue): string {
  const field = issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.');
  return `${field}: ${issue.message}`;
}

function admit<T>(what: string, schema: z.ZodType<T>, value: unknown): Admission<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.map(describeIssue).join('; ');
  return { ok: false, reason: `${what} refused: ${issues}` };
}

export function admitTicketReadiness(value: unknown): Admission<TicketReadiness> {
  return admit('ticket readiness', ticketReadinessSchema, value);
}

export function admitCuratorQueue(value: unknown): Admission<CuratorQueue> {
  return admit('curator queue', curatorQueueSchema, value);
}

export function admitConflictClass(value: unknown): Admission<ConflictClass> {
  return admit('conflict class', conflictClassSchema, value);
}

export function admitReviewVerdict(value: unknown): Admission<ReviewVerdict> {
  return admit('review verdict', reviewVerdictSchema, value);
}
