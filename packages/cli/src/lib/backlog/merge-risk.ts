// Derive the auto-merge risk signals from a diff's file list (pure, path-based). Conservative by
// design: a false positive only routes the cluster to a human merge, never the reverse. Feeds the
// AutoMergeRisk that autoMergeGate consumes (the caller adds clusterId + isStackRoot).

export interface RiskSignals {
  readonly fileCount: number;
  readonly touchesUi: boolean;
  readonly touchesSecurity: boolean;
  readonly touchesMigration: boolean;
}

// Aligned with the protect-sensitive-files hook (env/keys/secrets) plus auth/security paths.
const SECURITY = [
  /\.(pem|key|p12|pfx|keystore|jks|asc)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/i,
  /(secret|credential)/i,
  /(^|\/)\.(npmrc|netrc|pgpass)$/i,
  /(^|\/)(auth|security)(\/|$)/i,
];

// Aligned with migrations-safety (*.sql, migrations dirs, drizzle).
const MIGRATION = [/\.sql$/i, /(^|\/)migrations?(\/|$)/i, /(^|\/)drizzle(\/|\.|$)/i];

const UI = [/\.(tsx|jsx|css|scss|sass)$/i, /(^|\/)components?(\/|$)/i, /(^|\/)app(\/|$)/i];

/** `.env` / `.env.local` are secrets; `.env.example` / `.sample` / `.template` / `.dist` are not. */
function isEnvSecret(file: string): boolean {
  const base = file.split('/').pop() ?? file;
  return /^\.env(\.[^.]+)*$/i.test(base) && !/\.(example|sample|template|dist)$/i.test(base);
}

const matchesAny = (file: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((re) => re.test(file));

export function riskSignalsFromDiff(files: readonly string[]): RiskSignals {
  return {
    fileCount: files.length,
    touchesUi: files.some((f) => matchesAny(f, UI)),
    touchesSecurity: files.some((f) => isEnvSecret(f) || matchesAny(f, SECURITY)),
    touchesMigration: files.some((f) => matchesAny(f, MIGRATION)),
  };
}
