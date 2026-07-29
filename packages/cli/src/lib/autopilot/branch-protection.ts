// Server-side branch protection is what actually stops a worker from pushing
// straight to the base — not any check the harness performs on itself. So the
// run refuses to start until protection was POSITIVELY observed.
//
// Failing closed matters more here than anywhere else in the lease: an
// unauthenticated `gh`, a network blip and a genuinely unprotected branch all
// look the same from inside, and only one of them is safe. Unknown is therefore
// treated exactly like unprotected.
//
// Pure. The skill performs the API call; these functions interpret and decide.

export type ProtectionObservation =
  | { readonly kind: 'protected'; readonly requiredChecks: readonly string[] }
  | { readonly kind: 'unprotected' }
  | { readonly kind: 'unknown'; readonly reason: string };

export type ProtectionRefusal = 'unprotected' | 'unknown' | 'no-required-checks' | 'malformed-observation';

export interface ProtectionDecision {
  readonly allowed: boolean;
  readonly reason: 'protected' | ProtectionRefusal;
  readonly detail: string;
}

export interface ProtectionResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
}

/** GitHub's exact 404 message when a branch exists but carries no protection. */
const NOT_PROTECTED = /branch not protected/i;
const MAX_REASON_LENGTH = 300;

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_REASON_LENGTH ? flat : `${flat.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

function requiredChecksOf(payload: Record<string, unknown>): readonly string[] {
  const required = payload.required_status_checks;
  if (typeof required !== 'object' || required === null) return [];

  const block = required as { contexts?: unknown; checks?: unknown };
  if (Array.isArray(block.contexts)) {
    return block.contexts.filter((context): context is string => typeof context === 'string');
  }
  if (Array.isArray(block.checks)) {
    return block.checks
      .map((check) => (check as { context?: unknown })?.context)
      .filter((context): context is string => typeof context === 'string');
  }
  return [];
}

/** Turn a raw protection API response into an observation. */
export function interpretProtectionResponse(response: ProtectionResponse): ProtectionObservation {
  if (!response.ok) {
    if (NOT_PROTECTED.test(response.body)) return { kind: 'unprotected' };
    return { kind: 'unknown', reason: truncate(`HTTP ${response.status}: ${response.body}`) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return { kind: 'unknown', reason: 'the protection endpoint returned a body that is not JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unknown', reason: 'the protection endpoint returned an empty body' };
  }

  const payload = parsed as Record<string, unknown>;
  if (typeof payload.message === 'string' && NOT_PROTECTED.test(payload.message)) {
    return { kind: 'unprotected' };
  }
  return { kind: 'protected', requiredChecks: requiredChecksOf(payload) };
}

/** Decide whether a run may start against this base. */
export function decideBranchProtection(observation: ProtectionObservation, base: string): ProtectionDecision {
  switch (observation?.kind) {
    case 'protected':
      if (observation.requiredChecks.length === 0) {
        return {
          allowed: false,
          reason: 'no-required-checks',
          detail: `\`${base}\` is protected but requires no status check, so a red suite could still merge. Add at least one required check to the branch protection rule.`,
        };
      }
      return {
        allowed: true,
        reason: 'protected',
        detail: `\`${base}\` requires ${observation.requiredChecks.join(', ')}`,
      };

    case 'unprotected':
      return {
        allowed: false,
        reason: 'unprotected',
        detail: `\`${base}\` has no server-side protection, so nothing but the worker itself would stop a direct push. Protect the branch before running autopilot against it.`,
      };

    case 'unknown':
      return {
        allowed: false,
        reason: 'unknown',
        detail: `the protection of \`${base}\` could not be determined: ${observation.reason}. Autopilot treats unknown as unprotected; restore the tracker/GitHub credentials and retry.`,
      };

    default:
      return {
        allowed: false,
        reason: 'malformed-observation',
        detail: `the protection observation for \`${base}\` has an unrecognised shape. Re-observe the branch protection and pass the result unmodified.`,
      };
  }
}
