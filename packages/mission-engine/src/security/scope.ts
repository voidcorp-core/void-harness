// Whether a security probe may touch a target at all.
//
// This is the module that says no. Everything downstream — scanners, DAST
// adapters, the baseline workflow — asks here first, and a refusal is final.
//
// Three rules shape it:
//
//   1. External means "not provably this machine". The module resolves no DNS,
//      so a hostname it cannot prove is loopback is external, even if it would
//      answer 127.0.0.1 right now. That is DNS rebinding, and the safe bias is
//      to refuse a name rather than trust a lookup that can change between the
//      check and the request.
//   2. Authorization is a time-boxed grant naming hosts, an authorizer and an
//      expiry. Anything it cannot read is refused rather than assumed open — an
//      unreadable expiry that defaults to "valid" is a permanent grant.
//   3. Scope does not inherit downward. Authorizing `staging.example.test` does
//      not authorize `api.staging.example.test`, which may be another service
//      with another owner.
//
// Pure, and deliberately so: the decision has to be testable without a network,
// and it must not be able to reach the thing it is deciding about.

export interface ScopeAuthorization {
  /** Hosts explicitly authorized. Exact matches, never suffixes. */
  readonly hosts: readonly string[];
  /** Who granted it. Recorded so a refusal or a scan can be attributed. */
  readonly authorizedBy: string;
  readonly authorizedAt: string;
  /** ISO instant after which the grant is void. */
  readonly expiresAt: string;
  /** Whether probes may write, delete or otherwise change state. */
  readonly destructive: boolean;
  /** Whether the target is disposable rather than shared with real users. */
  readonly ephemeralTarget: boolean;
}

export type ScopeRefusal =
  | 'not-a-url'
  | 'unsupported-scheme'
  | 'no-authorization'
  | 'authorization-malformed'
  | 'authorization-expired'
  | 'host-not-authorized'
  | 'shared-target'
  | 'redirect-leaves-scope';

export type ScopeVerdict =
  | {
      readonly kind: 'allowed';
      readonly host: string;
      /** True only when the grant says so; loopback does not imply it. */
      readonly destructiveAllowed: boolean;
    }
  | {
      readonly kind: 'refused';
      readonly reason: ScopeRefusal;
      readonly detail: string;
    };

const ALLOWED_SCHEMES = ['http:', 'https:'];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

function refuse(reason: ScopeRefusal, detail: string): ScopeVerdict {
  return Object.freeze({ kind: 'refused', reason, detail });
}

/**
 * The host of a target, lowercased, or undefined when it is not a usable URL.
 *
 * Only the host is ever extracted. A target URL can carry credentials in its
 * userinfo and a token in its query, and neither takes part in the decision —
 * so neither can end up in a verdict that gets logged.
 */
function hostOf(target: string): string | undefined {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  if (!ALLOWED_SCHEMES.includes(url.protocol)) return '';
  return url.hostname.toLowerCase();
}

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host);
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !Number.isNaN(Date.parse(value));
}

function malformed(authorization: ScopeAuthorization): string | undefined {
  if (!Array.isArray(authorization.hosts) || authorization.hosts.length === 0) {
    return 'the authorization names no host';
  }
  if (authorization.hosts.some((host) => typeof host !== 'string' || host.trim() === '')) {
    return 'the authorization names an empty host';
  }
  if (typeof authorization.authorizedBy !== 'string' || authorization.authorizedBy.trim() === '') {
    return 'the authorization names nobody as its authorizer';
  }
  if (!isIsoInstant(authorization.expiresAt)) {
    return 'the authorization has no readable expiry, and an unreadable expiry is not an open one';
  }
  return undefined;
}

/**
 * Decide whether a probe may touch `target`.
 *
 * `authorization` is null when the operator granted none, which is the common
 * case and the one this module exists to refuse.
 */
export function authorizeTarget(
  target: string,
  authorization: ScopeAuthorization | null,
  now: string,
): ScopeVerdict {
  const host = hostOf(target);
  if (host === undefined) return refuse('not-a-url', 'the target is not a URL this module can read');
  if (host === '') return refuse('unsupported-scheme', 'only http and https targets can be probed');

  // Literal loopback is this machine, and needs no grant. A name is not proof.
  if (isLoopback(host)) {
    return Object.freeze({
      kind: 'allowed',
      host,
      // Never inherited from being local: deleting local data is still deleting.
      destructiveAllowed: authorization?.destructive === true,
    });
  }

  if (authorization === null) {
    return refuse(
      'no-authorization',
      `\`${host}\` is not this machine and no authorization was given for it`,
    );
  }

  const problem = malformed(authorization);
  if (problem !== undefined) return refuse('authorization-malformed', problem);

  const instant = Date.parse(now);
  if (Number.isNaN(instant)) {
    return refuse('authorization-malformed', 'the current instant is unreadable, so no grant can be aged');
  }
  if (instant >= Date.parse(authorization.expiresAt)) {
    return refuse('authorization-expired', `the authorization expired at ${authorization.expiresAt}`);
  }

  const authorized = authorization.hosts.map((entry) => entry.trim().toLowerCase());
  if (!authorized.includes(host)) {
    return refuse(
      'host-not-authorized',
      `\`${host}\` is not among the authorized hosts; scope is exact and does not extend to subdomains`,
    );
  }

  if (authorization.ephemeralTarget !== true) {
    return refuse(
      'shared-target',
      `\`${host}\` is not declared ephemeral; a shared target needs an authorization that says so, because a probe there reaches real users`,
    );
  }

  // A private literal needs no separate rule: it is not loopback, so it fell
  // through every check above and required an explicit grant like any other
  // host. A lab address inside a named scope is a legitimate target.
  return Object.freeze({ kind: 'allowed', host, destructiveAllowed: authorization.destructive === true });
}

/**
 * Decide whether a redirect may be followed.
 *
 * Following redirects blindly is how a scan of an authorized host becomes a scan
 * of something else — including of the machine running it, when the destination
 * is loopback. So the destination is judged on its own, and it must land inside
 * the same grant rather than merely be reachable.
 */
export function authorizeRedirect(
  from: string,
  to: string,
  authorization: ScopeAuthorization | null,
  now: string,
): ScopeVerdict {
  const destination = hostOf(to);
  if (destination === undefined) {
    return refuse('not-a-url', 'the redirect destination is not a URL this module can read');
  }
  if (destination === '') {
    return refuse('unsupported-scheme', 'only http and https redirects can be followed');
  }

  const origin = hostOf(from);
  const verdict = authorizeTarget(to, authorization, now);
  if (verdict.kind === 'allowed' && origin !== undefined && origin !== '' && destination !== origin) {
    // Both may be individually allowed and still not be the same scope: the
    // origin was authorized, loopback needs no authorization, and hopping
    // between them is exactly the escape this guards.
    return refuse(
      'redirect-leaves-scope',
      `the redirect leaves \`${origin}\` for \`${destination}\`, which is outside the scope that was granted`,
    );
  }
  if (verdict.kind === 'refused') {
    return refuse(
      'redirect-leaves-scope',
      `the redirect leaves \`${origin ?? 'the target'}\` for \`${destination}\`, which is outside the scope that was granted`,
    );
  }
  return verdict;
}
