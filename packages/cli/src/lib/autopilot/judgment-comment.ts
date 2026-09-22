// A judgment carried on its pull request, where a restart finds it again.
//
// The reviewer's verdict and a worker's conflict class are posted as comments,
// each in a block a machine can find: two HTML comments, invisible once GitHub
// renders the page, around a fenced JSON value. The block is admitted when it is
// written, so an agent cannot post one the kernel would refuse, and admitted
// again where the kernel consumes it, because a comment is text anyone can edit.
//
//   <!-- void-autopilot:review-verdict -->
//   ```json
//   { "headSha": "…", "round": 1, "blocking": [], "advisory": [] }
//   ```
//   <!-- /void-autopilot:review-verdict -->
//
// Pure: it renders and reads text; posting and fetching comments is `gh`'s job.

import { autopilotFailure } from './errors.js';
import { type Admission, admitConflictClass, admitReviewVerdict } from './judgments.js';

export const JUDGMENT_KINDS = ['review-verdict', 'conflict-class'] as const;
export type JudgmentKind = (typeof JUDGMENT_KINDS)[number];

const ADMISSIONS: Readonly<Record<JudgmentKind, (value: unknown) => Admission<unknown>>> = {
  'review-verdict': admitReviewVerdict,
  'conflict-class': admitConflictClass,
};

const opening = (kind: JudgmentKind): string => `<!-- void-autopilot:${kind} -->`;
const closing = (kind: JudgmentKind): string => `<!-- /void-autopilot:${kind} -->`;

/** The comment body for an admitted judgment; a judgment its kind refuses is never rendered. */
export function renderJudgmentComment(kind: JudgmentKind, value: unknown): string {
  const admission = ADMISSIONS[kind](value);
  if (!admission.ok) {
    throw autopilotFailure(
      'AUTOPILOT_INPUT',
      `the ${kind} judgment was refused`,
      admission.reason,
      'correct the named field; a refused judgment is never posted',
    );
  }
  const json = JSON.stringify(admission.value, undefined, 2);
  return `${opening(kind)}\n\`\`\`json\n${json}\n\`\`\`\n${closing(kind)}\n`;
}

function blockPattern(kind: JudgmentKind): RegExp {
  // The markers are fixed ASCII, so escaping only the regex specials they hold suffices.
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(
    `${literal(opening(kind))}\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`\\s*${literal(closing(kind))}`,
    'g',
  );
}

/**
 * Every block of `kind` across comment bodies given oldest first, each as parsed
 * JSON, or as its raw text when it is not JSON so that an admission refuses it
 * with a reason.
 */
export function judgmentsOf(bodies: readonly string[], kind: JudgmentKind): unknown[] {
  return bodies.flatMap((body) =>
    [...body.matchAll(blockPattern(kind))].map((match) => {
      const text = match[1] ?? '';
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }),
  );
}

/** The last block of `kind` across comment bodies given oldest first; undefined when none. */
export function latestJudgment(bodies: readonly string[], kind: JudgmentKind): unknown {
  return judgmentsOf(bodies, kind).at(-1);
}
