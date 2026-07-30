// The pull request body: the only place a reviewer sees what a cluster did.
//
// A reconciled branch mixes several tickets into one diff, which is exactly the
// property that makes it cheap to open and expensive to review. The body pays
// that back by keeping provenance per ticket: which ticket, which commits, what
// was decided when ranges collided, what was proven locally, what it cost
// remotely, and what did NOT make it in — with the reason and the way to resume.
//
// Two deliberate refusals:
//
//   - No closing keyword. `Closes DEV-1` hands a merge the power to end a ticket
//     without anyone confirming the ticket is done; completion is decided from
//     observed merge state, in `tracker-lifecycle`.
//   - No empty section. A header with nothing under it reads as "nothing to
//     report" and hides the difference between checked and absent.

export interface TicketProvenance {
  readonly ticketId: string;
  readonly title: string;
  readonly url?: string;
  readonly range: {
    readonly baseSha: string;
    readonly headSha: string;
    readonly commits: readonly string[];
  };
}

export interface ExcludedTicket {
  readonly ticketId: string;
  readonly reason: string;
  readonly detail: string;
  /** What someone does to get this ticket moving again. */
  readonly resume: string;
}

export interface ReconciliationDecision {
  readonly subject: string;
  readonly choice: string;
  readonly because: string;
}

export interface PrBodyInput {
  readonly clusterId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly integrationSha: string;
  readonly included: readonly TicketProvenance[];
  readonly excluded: readonly ExcludedTicket[];
  readonly decisions: readonly ReconciliationDecision[];
  readonly verification: readonly { readonly name: string; readonly passed: boolean }[];
  readonly ci: { readonly total: number | null; readonly honest: boolean; readonly detail: string };
  readonly blockers: readonly string[];
}

/** GitHub rejects a pull request body above 65536 characters. */
export const PR_BODY_MAX_BYTES = 65_536;

const TRUNCATION = '_The body was truncated to fit the pull request size limit; the run log holds the full detail._';

function short(sha: string): string {
  return sha.slice(0, 12);
}

function ticketLabel(ticket: TicketProvenance): string {
  const name = `${ticket.ticketId} — ${ticket.title}`;
  return ticket.url === undefined ? name : `[${name}](${ticket.url})`;
}

/** Drop trailing lines until the body fits, leaving a visible marker behind. */
function bound(lines: readonly string[]): string {
  const body = `${lines.join('\n')}\n`;
  if (Buffer.byteLength(body, 'utf8') <= PR_BODY_MAX_BYTES) return body;

  const budget = PR_BODY_MAX_BYTES - Buffer.byteLength(`\n\n${TRUNCATION}\n`, 'utf8');
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    const cost = Buffer.byteLength(`${line}\n`, 'utf8');
    if (size + cost > budget) break;
    kept.push(line);
    size += cost;
  }
  return `${kept.join('\n')}\n\n${TRUNCATION}\n`;
}

export function renderPullRequestBody(input: PrBodyInput): string {
  const lines: string[] = [
    `Reconciled integration for cluster \`${input.clusterId}\`.`,
    '',
    `Base \`${input.base.branch}\` at \`${short(input.base.sha)}\`, integration head \`${short(input.integrationSha)}\`.`,
    // No issue-closing keyword appears anywhere in this body, including here:
    // the phrase that denies the behaviour would itself trigger it.
    'Merging is a human action: this branch arms no auto-merge, and no ticket is completed by this body.',
    '',
  ];

  lines.push('## In this pull request', '');
  if (input.included.length === 0) {
    lines.push('_No ticket range was integrable. This branch should not have been published._', '');
  } else {
    lines.push('| Ticket | Commit range | Commits |', '| --- | --- | --- |');
    for (const ticket of input.included) {
      const range = `\`${short(ticket.range.baseSha)}..${short(ticket.range.headSha)}\``;
      lines.push(`| ${ticketLabel(ticket)} | ${range} | ${ticket.range.commits.length} |`);
    }
    lines.push('');
  }

  if (input.excluded.length > 0) {
    lines.push('## Not in this pull request', '');
    for (const ticket of input.excluded) {
      lines.push(`- **${ticket.ticketId}** (${ticket.reason}) — ${ticket.detail}`);
      lines.push(`  Resume: ${ticket.resume}`);
    }
    lines.push('');
  }

  if (input.decisions.length > 0) {
    lines.push('## Reconciliation decisions', '');
    for (const decision of input.decisions) {
      lines.push(`- **${decision.subject}** — ${decision.choice}`);
      lines.push(`  Because: ${decision.because}`);
    }
    lines.push('');
  }

  lines.push('## Local verification', '');
  lines.push(`Run against \`${short(input.integrationSha)}\`, the exact tree published here.`, '');
  for (const command of input.verification) {
    lines.push(`- \`${command.name}\` — ${command.passed ? 'passed' : '**failed**'}`);
  }
  lines.push('');

  lines.push('## Remote CI', '');
  lines.push(
    input.ci.honest && input.ci.total !== null
      ? `${input.ci.total} run(s): ${input.ci.detail}.`
      : `Not counted: ${input.ci.detail}.`,
  );
  lines.push('');

  if (input.blockers.length > 0) {
    lines.push('## Blockers', '');
    for (const blocker of input.blockers) lines.push(`- ${blocker}`);
    lines.push('');
  }

  return bound(lines);
}
