// Subscription-billing guard for the backlog-loop worker sessions.
//
// Claude Code's auth precedence (official): cloud-provider vars >
// ANTHROPIC_AUTH_TOKEN > ANTHROPIC_API_KEY > apiKeyHelper >
// CLAUDE_CODE_OAUTH_TOKEN > /login OAuth. In headless `-p`, a present
// ANTHROPIC_API_KEY is used WITHOUT a prompt → pay-per-token API billing.
//
// The loop must bill the user's subscription. So the worker is spawned with an
// env that has the API credentials removed, falling back to the stored OAuth
// (subscription) credentials. Cloud-provider routing vars cannot be silently
// dropped without breaking a deliberate setup, so we refuse the run instead —
// unless the user opts into API billing with --allow-api.

/** API credential vars that, if present, route to pay-per-token billing. */
const API_CRED_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

/** Cloud-provider routing vars that force non-subscription billing. */
const CLOUD_ROUTING_VARS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
] as const;

type Env = Record<string, string | undefined>;

/**
 * Env for a worker subprocess that bills the subscription. With `allowApi`,
 * the env is returned unchanged (caller opted into API billing); otherwise the
 * API credential vars are removed so Claude Code falls back to OAuth.
 */
export function subscriptionEnv(env: Env, allowApi: boolean): Env {
  const copy: Env = { ...env };
  if (allowApi) return copy;
  for (const key of API_CRED_VARS) delete copy[key];
  return copy;
}

export interface BillingPreflight {
  /** False means the run must not proceed (see `reason`). */
  readonly ok: boolean;
  /** Present only when `ok` is false: why subscription billing can't be guaranteed. */
  readonly reason?: string;
  /** API credential vars present that will be stripped from the worker env. */
  readonly stripped: readonly string[];
}

/**
 * Decide whether a subscription-billed run can proceed. Cloud-provider routing
 * vars block the run (unless `allowApi`); API credential vars are reported as
 * strippable, not blocking.
 */
export function assertSubscription(env: Env, allowApi: boolean): BillingPreflight {
  if (!allowApi) {
    const cloud = CLOUD_ROUTING_VARS.find((key) => env[key] !== undefined && env[key] !== '');
    if (cloud !== undefined) {
      return {
        ok: false,
        reason: `${cloud} is set, which routes billing away from your subscription. Unset it, or pass --allow-api to bill the API deliberately.`,
        stripped: [],
      };
    }
  }
  const stripped = allowApi ? [] : API_CRED_VARS.filter((key) => env[key] !== undefined && env[key] !== '');
  return { ok: true, stripped };
}
