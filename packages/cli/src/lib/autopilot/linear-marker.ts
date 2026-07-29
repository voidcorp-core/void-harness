// The lease marker: a bounded, versioned block posted as a tracker comment so a
// later session can find the run that owns a ticket without being told anything.
//
// The comment thread is the only place a lease can live that survives a lost
// clone, a compaction, or another machine looking at the same ticket. So the
// marker is written to be read by a machine first: fixed delimiters, JSON
// payload, slug-only identifiers.
//
// Nothing here is free text. Every identifier is validated on the way out AND on
// the way in, because a marker is attacker-adjacent input — anyone with comment
// access to the tracker can write one, and a lease is what decides whether a
// worker starts.

export const MARKER_BEGIN = '<!-- void-harness:autopilot-lease:v1';
export const MARKER_END = 'void-harness:autopilot-lease:end -->';

/** Comments longer than this are not read at all: a marker is never large. */
const MAX_COMMENT_LENGTH = 100_000;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

export interface LeaseMarker {
  readonly schemaVersion: 1;
  /** Stable program slug, as declared by the active program. */
  readonly programId: string;
  readonly runId: string;
  readonly clusterId: string;
  readonly baseBranch: string;
  /** Full commit id of the base the run was planned against. */
  readonly baseSha: string;
  readonly integrationBranch: string;
  /** ISO-8601 instant after which the lease is stale. */
  readonly expiresAt: string;
}

const SLUG_FIELDS = [
  'programId',
  'runId',
  'clusterId',
  'baseBranch',
  'integrationBranch',
] as const satisfies readonly (keyof LeaseMarker)[];

function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validate(marker: LeaseMarker): void {
  for (const field of SLUG_FIELDS) {
    const value = marker[field];
    // `..` is refused even though its characters are legal: these identifiers
    // become branch names and worktree path segments downstream, so one would
    // be a directory traversal wearing a branch name.
    if (typeof value !== 'string' || !SLUG.test(value) || value.split('/').includes('..')) {
      throw new Error(
        `autopilot: lease marker \`${field}\` must be a slug of letters, digits, dot, dash, slash or underscore, received ${JSON.stringify(value)}. Derive it from an identifier, never from a free-form title.`,
      );
    }
  }
  if (!COMMIT_SHA.test(marker.baseSha)) {
    throw new Error(
      `autopilot: lease marker \`baseSha\` must be a full 40-character commit id, received ${JSON.stringify(marker.baseSha)}. Resolve the base to a commit before claiming the cluster.`,
    );
  }
  if (!isIsoInstant(marker.expiresAt)) {
    throw new Error(
      `autopilot: lease marker \`expiresAt\` must be an ISO-8601 instant, received ${JSON.stringify(marker.expiresAt)}. Compute the expiry from the run clock and format it as ISO-8601.`,
    );
  }
}

/** Serialise a lease marker into the comment block that carries it. */
export function renderLeaseMarker(marker: LeaseMarker): string {
  validate(marker);
  const payload = {
    schemaVersion: 1,
    programId: marker.programId,
    runId: marker.runId,
    clusterId: marker.clusterId,
    baseBranch: marker.baseBranch,
    baseSha: marker.baseSha,
    integrationBranch: marker.integrationBranch,
    expiresAt: marker.expiresAt,
  };
  return `${MARKER_BEGIN}\n${JSON.stringify(payload, null, 2)}\n${MARKER_END}`;
}

/**
 * Read the first lease marker in a comment, or undefined when there is none the
 * parser fully trusts.
 *
 * Undefined always means "no usable lease here", never "probably fine": a
 * truncated, tampered or unknown-version marker reads as absent, so a caller
 * that cannot find a lease falls back to acquiring one rather than acting on
 * half of someone else's.
 */
export function parseLeaseMarker(comment: string): LeaseMarker | undefined {
  if (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH) return undefined;

  const start = comment.indexOf(MARKER_BEGIN);
  if (start === -1) return undefined;
  const bodyStart = start + MARKER_BEGIN.length;
  const end = comment.indexOf(MARKER_END, bodyStart);
  if (end === -1) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(comment.slice(bodyStart, end));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;

  const candidate = parsed as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return undefined;

  const marker: LeaseMarker = {
    schemaVersion: 1,
    programId: String(candidate.programId ?? ''),
    runId: String(candidate.runId ?? ''),
    clusterId: String(candidate.clusterId ?? ''),
    baseBranch: String(candidate.baseBranch ?? ''),
    baseSha: String(candidate.baseSha ?? ''),
    integrationBranch: String(candidate.integrationBranch ?? ''),
    expiresAt: String(candidate.expiresAt ?? ''),
  };
  try {
    // Same validation as writing: a marker someone else wrote gets no more
    // trust than one we would have refused to write ourselves.
    validate(marker);
  } catch {
    return undefined;
  }
  return marker;
}

/** True when the lease is stale at `now`, including when `now` is unreadable. */
export function isExpired(marker: LeaseMarker, now: string): boolean {
  const instant = Date.parse(now);
  if (Number.isNaN(instant)) return true;
  return instant >= Date.parse(marker.expiresAt);
}
