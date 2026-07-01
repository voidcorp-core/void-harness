// Derive the auto-merge risk signals from a diff's file list (pure, path-based). Conservative by
// design: a false positive only routes the cluster to a human merge, never the reverse — so the
// security net is deliberately WIDE. Feeds the AutoMergeRisk that autoMergeGate consumes (the
// caller adds clusterId + isStackRoot).

export interface RiskSignals {
  readonly fileCount: number;
  readonly touchesUi: boolean;
  readonly touchesSecurity: boolean;
  readonly touchesMigration: boolean;
}

// Secret-bearing files by extension / well-known name (aligned with the protect-sensitive-files hook).
const SECURITY_FILE = [
  /\.(pem|key|p12|pfx|keystore|jks|asc)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/i,
  /(^|\/)\.(npmrc|netrc|pgpass)$/i,
];

// Security-sensitive path/name tokens, matched as WHOLE segments (after a camelCase split) so
// `src/middleware.ts`, `src/lib/jwt.ts`, `sessionStorage.ts` are caught while `author.ts` /
// `oracle.ts` are not. A directory-only match would miss the flat files that guard every route.
const SECURITY_TOKENS = new Set([
  'auth', 'security', 'secret', 'secrets', 'credential', 'credentials', 'password', 'passwd',
  'jwt', 'token', 'tokens', 'oauth', 'oidc', 'saml', 'session', 'sessions', 'cookie', 'cookies',
  'cors', 'csrf', 'xsrf', 'rbac', 'permission', 'permissions', 'tenant', 'tenancy', 'crypto',
  'bcrypt', 'argon2', 'middleware', 'signin', 'signup', 'login', 'logout', 'apikey',
]);

const MIGRATION = [/\.sql$/i, /(^|\/)migrations?(\/|$)/i, /(^|\/)drizzle(\/|\.|$)/i];

const UI = [/\.(tsx|jsx|css|scss|sass)$/i, /(^|\/)components?(\/|$)/i, /(^|\/)app(\/|$)/i];

/** `.env` / `.env.local` are secrets; `.env.example` / `.sample` / `.template` / `.dist` are not. */
function isEnvSecret(file: string): boolean {
  const base = file.split('/').pop() ?? file;
  return /^\.env(\.[^.]+)*$/i.test(base) && !/\.(example|sample|template|dist)$/i.test(base);
}

/** Split a path into lowercase word segments, breaking on separators AND camelCase transitions. */
function segments(file: string): Set<string> {
  const spaced = file.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return new Set(spaced.split(/[^a-z0-9]+/).filter(Boolean));
}

const matchesAny = (file: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((re) => re.test(file));

function touchesSecurity(file: string): boolean {
  if (isEnvSecret(file) || matchesAny(file, SECURITY_FILE)) return true;
  for (const seg of segments(file)) if (SECURITY_TOKENS.has(seg)) return true;
  return false;
}

export function riskSignalsFromDiff(files: readonly string[]): RiskSignals {
  return {
    fileCount: files.length,
    touchesUi: files.some((f) => matchesAny(f, UI)),
    touchesSecurity: files.some(touchesSecurity),
    touchesMigration: files.some((f) => matchesAny(f, MIGRATION)),
  };
}
